-- Click analytics deliberately keep no exact visit timestamp. The UTC `day` is
-- enough for reporting and retention, and avoids a fine-grained behavioural
-- record that the product does not need.
CREATE TABLE click_events_minimized (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  link_id TEXT NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2),
  referrer_domain TEXT NOT NULL,
  device_class TEXT NOT NULL CHECK (device_class IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown'))
);

INSERT INTO click_events_minimized (id, workspace_id, link_id, day, country_code, referrer_domain, device_class)
SELECT id, workspace_id, link_id, day, country_code, referrer_domain, device_class FROM click_events;

DROP TABLE click_events;
ALTER TABLE click_events_minimized RENAME TO click_events;

CREATE INDEX click_events_link_day_idx ON click_events(link_id, day);
CREATE INDEX click_events_workspace_day_idx ON click_events(workspace_id, day);
