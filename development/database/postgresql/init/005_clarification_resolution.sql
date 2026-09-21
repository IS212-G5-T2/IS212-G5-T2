-- SPM-39 follow-up: clarification/amendment threads move from a single
-- coordinator-asks/organiser-replies exchange to an open back-and-forth
-- between the organiser and assigned coordinator, closed only by an explicit
-- resolve action (rather than implicitly by the first reply).

ALTER TABLE event_comments
    ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false;
