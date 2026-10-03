CREATE TABLE IF NOT EXISTS data_retention_policies (
  data_class text PRIMARY KEY,
  retention_days integer NOT NULL CHECK (retention_days > 0),
  delete_allowed boolean NOT NULL,
  notes text NOT NULL
);
INSERT INTO data_retention_policies(data_class,retention_days,delete_allowed,notes) VALUES
 ('financial_ledger',3650,false,'Keep authoritative financial records; corrections use compensating entries.'),
 ('orders',3650,false,'Exchange order history is retained as an execution record.'),
 ('fills',3650,false,'Execution facts are immutable.'),
 ('deposits',3650,false,'On-chain deposit evidence.'),
 ('withdrawals',3650,false,'Settlement and compliance record.'),
 ('transfers',3650,false,'Internal transfer record.'),
 ('audit_events',2555,false,'Security/audit evidence; archive rather than delete where required.'),
 ('bot_runtime_snapshots',180,true,'Operational history.'),
 ('bot_logs_firestore',90,true,'Operational UI logs.'),
 ('api_logs',90,true,'Operational request logs.'),
 ('notifications',90,true,'User-facing transient notifications.')
ON CONFLICT (data_class) DO UPDATE SET retention_days=EXCLUDED.retention_days,delete_allowed=EXCLUDED.delete_allowed,notes=EXCLUDED.notes;
