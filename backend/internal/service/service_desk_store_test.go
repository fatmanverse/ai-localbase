package service

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestInitServiceDeskTablesMigratesGovernanceColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "service-desk-migrate.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	statements := []string{
		`CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL,
			document_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			metadata TEXT NOT NULL DEFAULT '{}',
			seq INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS faq_candidates (
			id TEXT PRIMARY KEY,
			question_normalized TEXT NOT NULL UNIQUE,
			question_text TEXT NOT NULL,
			answer_text TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			source_message_id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			like_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'candidate',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS knowledge_gaps (
			id TEXT PRIMARY KEY,
			question_normalized TEXT NOT NULL,
			issue_type TEXT NOT NULL,
			question_text TEXT NOT NULL,
			sample_answer TEXT NOT NULL DEFAULT '',
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			suggested_action TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE(question_normalized, issue_type)
		);`,
		`CREATE TABLE IF NOT EXISTS low_quality_answers (
			id TEXT PRIMARY KEY,
			source_message_id TEXT NOT NULL UNIQUE,
			conversation_id TEXT NOT NULL,
			question_text TEXT NOT NULL,
			answer_text TEXT NOT NULL,
			knowledge_base_id TEXT NOT NULL DEFAULT '',
			primary_reason TEXT NOT NULL DEFAULT '',
			dislike_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'open',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			t.Fatalf("seed old schema: %v", err)
		}
	}
	_ = db.Close()

	store, err := NewSQLiteChatHistoryStore(path)
	if err != nil {
		t.Fatalf("open migrated store: %v", err)
	}
	defer func() { _ = store.Close() }()

	for _, table := range []string{"faq_candidates", "knowledge_gaps", "low_quality_answers"} {
		columns, err := store.sqliteTableColumns(table)
		if err != nil {
			t.Fatalf("table columns %s: %v", table, err)
		}
		for _, column := range []string{"owner", "note", "updated_by"} {
			if _, ok := columns[column]; !ok {
				t.Fatalf("expected %s.%s to exist after migration", table, column)
			}
		}
		if table == "faq_candidates" {
			for _, column := range []string{"published_question", "published_answer", "published_by", "published_at", "publish_note"} {
				if _, ok := columns[column]; !ok {
					t.Fatalf("expected %s.%s to exist after migration", table, column)
				}
			}
		}
	}
}
