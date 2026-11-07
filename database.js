/**
 * Enterprise Database Architecture - Cloud & Local
 * Powered by Native Node.js SQLite (ACID compliant, WAL mode enabled)
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'enterprise_nexus.sqlite');

class EnterpriseDatabase {
  constructor() {
    this.db = new DatabaseSync(DB_FILE);
    this.initPragmas();
    this.runMigrations();
    this.seedInitialData();
  }

  initPragmas() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
    `);
  }

  runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS engineers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'lead_engineer',
        specialization TEXT DEFAULT 'Robotics & AI Architecture',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('ftc', 'ai', 'sim', 'apps')),
        description TEXT NOT NULL,
        tech_stack TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'production',
        metrics_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS robot_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        robot_id TEXT NOT NULL DEFAULT 'BIOBUZZ_24096',
        battery_volts REAL,
        shooter_rpm REAL,
        target_locked INTEGER DEFAULT 0,
        pos_x REAL,
        pos_y REAL,
        heading_deg REAL,
        latency_ms REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        model_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS code_deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        target_ide TEXT NOT NULL DEFAULT 'Android Studio',
        lines_of_code INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        deployed_by TEXT NOT NULL DEFAULT 'NeoIA Coder Agent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO', 'WARN', 'ERROR', 'SECURITY')),
        details_json TEXT,
        ip_address TEXT DEFAULT '127.0.0.1',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
      CREATE INDEX IF NOT EXISTS idx_telemetry_created ON robot_telemetry(created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
    `);
  }

  seedInitialData() {
    const engineerCount = this.db.prepare('SELECT COUNT(*) as count FROM engineers').get().count;
    if (engineerCount === 0) {
      this.db.prepare(`
        INSERT INTO engineers (uuid, username, role, specialization)
        VALUES (?, ?, ?, ?)
      `).run('jhoandry-polanco-001', 'Jhoandry Polanco', 'Chief Systems Architect', 'FIRST Tech Challenge Lead & Swarm AI Engineer');
    }

    const projectCount = this.db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
    if (projectCount === 0) {
      const initialProjects = [
        { id: 'biobuzz-24096', title: 'BIOBUZZ 24096: Chasis de Competencia', cat: 'ftc', desc: 'Hardware y software para robot de competencia oficial con Mecanum y 20A.', tech: JSON.stringify(['Java', 'REV SDK', 'GoBILDA']), metrics: JSON.stringify({ autonomousPoints: 50 }) },
        { id: 'jhoandri-pathing', title: 'Jhoandri Pathing Calibration Engine', cat: 'ftc', desc: 'Algoritmo cinemático propio para calibración de derrape transversal Mecanum.', tech: JSON.stringify(['Mecanum Kinematics', 'Odometry', 'Java 17']), metrics: JSON.stringify({ strafeCompensationFactor: 1.1428 }) },
        { id: 'limelight-vision', title: 'Subensamble de Visión Limelight 3A', cat: 'ftc', desc: 'Pipeline de visión artificial para tracking de AprilTags a 100 FPS con Kp = 0.035.', tech: JSON.stringify(['Limelight 3A', 'AprilTags', 'Vision']), metrics: JSON.stringify({ fps: 100, latencyMs: 9.8 }) },
        { id: 'neoia-swarm', title: 'NeoIA Nexus: Enjambre de 7 Agentes', cat: 'ai', desc: 'Sistema distribuido de agentes especializados con consenso probabilístico.', tech: JSON.stringify(['LangChain', 'Ollama', 'Multi-Agent']), metrics: JSON.stringify({ activeAgents: 7 }) }
      ];

      const stmt = this.db.prepare(`
        INSERT INTO projects (project_id, title, category, description, tech_stack, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const p of initialProjects) {
        stmt.run(p.id, p.title, p.cat, p.desc, p.tech, p.metrics);
      }
    }
  }

  getStats() {
    const tables = ['engineers', 'projects', 'robot_telemetry', 'chat_messages', 'code_deployments', 'system_audit_logs'];
    const tableCounts = {};
    for (const t of tables) {
      tableCounts[t] = this.db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get().count;
    }

    let fileSizeKB = 0;
    try {
      fileSizeKB = Math.round(fs.statSync(DB_FILE).size / 1024);
    } catch (e) {}

    return {
      engine: 'SQLite (Node.js Native DatabaseSync)',
      version: '3.45+ (WAL Mode)',
      filePath: DB_FILE,
      sizeKB: fileSizeKB,
      tableCounts,
      acidCompliant: true,
      walEnabled: true,
      timestamp: Date.now()
    };
  }

  getProjects(category = null) {
    if (category && category !== 'all') {
      return this.db.prepare('SELECT * FROM projects WHERE category = ? ORDER BY id ASC').all(category);
    }
    return this.db.prepare('SELECT * FROM projects ORDER BY id ASC').all();
  }

  logTelemetry(t) {
    return this.db.prepare(`
      INSERT INTO robot_telemetry (session_id, robot_id, battery_volts, shooter_rpm, target_locked, pos_x, pos_y, heading_deg, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      t.session_id || 'live_stream',
      t.robot_id || 'BIOBUZZ_24096',
      t.battery_volts || 12.4,
      t.shooter_rpm || 1200.0,
      t.target_locked ? 1 : 0,
      t.pos_x || 0,
      t.pos_y || 0,
      t.heading_deg || 0,
      t.latency_ms || 10.0
    );
  }

  getTelemetry(limit = 50) {
    return this.db.prepare('SELECT * FROM robot_telemetry ORDER BY id DESC LIMIT ?').all(limit);
  }

  logAudit(eventType, severity = 'INFO', details = {}, ip = '127.0.0.1') {
    return this.db.prepare(`
      INSERT INTO system_audit_logs (event_type, severity, details_json, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(eventType, severity, JSON.stringify(details), ip);
  }

  getAuditLogs(limit = 30) {
    return this.db.prepare('SELECT * FROM system_audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  }
}

module.exports = new EnterpriseDatabase();
