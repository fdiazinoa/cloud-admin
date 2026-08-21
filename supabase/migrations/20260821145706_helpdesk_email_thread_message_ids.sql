-- Store the RFC Message-ID separately from the Resend provider UUID. The
-- provider UUID remains necessary for delivery webhooks, while the RFC value
-- links In-Reply-To and References back to the original HelpDesk ticket.
ALTER TABLE landlord.ticket_messages
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_email_message_id_uidx
  ON landlord.ticket_messages (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- Existing tickets already retain the first inbound RFC Message-ID in their
-- technical context. Backfill the first client message so legacy threads can
-- be recognized immediately after deployment.
WITH first_client_messages AS (
  SELECT DISTINCT ON (message.ticket_id)
    message.id,
    message.ticket_id
  FROM landlord.ticket_messages AS message
  WHERE message.sender_type = 'Client'
  ORDER BY message.ticket_id, message.created_at ASC, message.id ASC
), candidates AS (
  SELECT
    first_message.id AS message_id,
    NULLIF(ticket.technical_context->>'resend_message_id', '') AS email_message_id
  FROM first_client_messages AS first_message
  JOIN landlord.support_tickets AS ticket
    ON ticket.id = first_message.ticket_id
  WHERE NULLIF(ticket.technical_context->>'resend_message_id', '') IS NOT NULL
), deduplicated_candidates AS (
  SELECT DISTINCT ON (candidate.email_message_id)
    candidate.message_id,
    candidate.email_message_id
  FROM candidates AS candidate
  ORDER BY candidate.email_message_id, candidate.message_id
)
UPDATE landlord.ticket_messages AS message
SET email_message_id = candidate.email_message_id
FROM deduplicated_candidates AS candidate
WHERE message.id = candidate.message_id
  AND message.email_message_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM landlord.ticket_messages AS existing
    WHERE existing.email_message_id = candidate.email_message_id
  );
