#!/usr/bin/env node
// Teacher-run nightly sweep (APSTAT_PARK_TRAINER_ABSORB_SPEC §6): re-posts the solo door's bonus
// point for every mastered calculator skill the relay failed to bank. Dry-run by default.
//
//   node scripts/park-bonus-sweep.mjs            print what would be posted
//   node scripts/park-bonus-sweep.mjs --apply    post through roster-server POST /class/bonus
//
// Env (the relay's own .env): SUPABASE_URL, SUPABASE_SERVICE_KEY (reads park_calc_srs),
// ROSTER_SERVICE_URL, ROSTER_TEACHER_KEY (the teacher key roster-server's requireTeacher accepts).
// Optional ROSTER_TEACHER_SECRET: with it the sweep reads each student's ledger first and skips
// skills that already have a BONUS-TI84-<skill> row; without it every mastered skill is re-posted,
// which is safe because /class/bonus upserts at attempt 1 (one point per skill per student).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createBonusRail } from '../apstat-park/calculator-bonus.mjs';
import { CALC_SRS_TABLE } from '../apstat-park/calculator-srs-store.mjs';
import { CALCULATOR_LEVELS } from '../apstat-park/calculator-curriculum.mjs';

const APPLY = process.argv.includes('--apply');
const ROSTER = String(process.env.ROSTER_SERVICE_URL || 'https://roster-production-12c1.up.railway.app').replace(/\/+$/, '');
const title = id => CALCULATOR_LEVELS.find(level => level.id === id)?.title || id;

async function masteredRows() {
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY is required to read ' + CALC_SRS_TABLE);
  const client = createClient(process.env.SUPABASE_URL || 'https://bzqbhtrurzzavhqbgqrs.supabase.co', process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from(CALC_SRS_TABLE).select('section,username,skill_id').eq('mastered', true).order('username').order('skill_id');
  if (error) throw new Error(CALC_SRS_TABLE + ': ' + error.message);
  return data || [];
}

// login_username -> student_id, from the teacher roster list (requireTeacher).
async function rosterIds(teacherKey) {
  const response = await fetch(ROSTER + '/roster/list', { headers: { 'x-teacher-secret': teacherKey } });
  if (!response.ok) throw new Error('/roster/list HTTP ' + response.status);
  const body = await response.json();
  const rows = body?.students || body?.rows || body?.data || [];
  return new Map(rows.map(row => [row.login_username || row.username, row.student_id]));
}

async function alreadyBanked(studentId, skillId, secret) {
  const response = await fetch(ROSTER + '/ledger/student/' + encodeURIComponent(studentId) + '?prefix=' + encodeURIComponent('BONUS-TI84-' + skillId),
    { headers: { 'x-teacher-secret': secret } });
  if (!response.ok) return false;
  const body = await response.json();
  const rows = body?.rows || body?.ledger || body?.data || [];
  return rows.some(row => (row.item_id || row.itemId) === 'BONUS-TI84-' + skillId);
}

async function main() {
  const teacherKey = process.env.ROSTER_TEACHER_KEY;
  if (!teacherKey) throw new Error('ROSTER_TEACHER_KEY is required');
  const rows = await masteredRows();
  console.log((APPLY ? 'APPLY' : 'DRY RUN') + ': ' + rows.length + ' mastered skill row(s) in ' + CALC_SRS_TABLE);
  const secret = process.env.ROSTER_TEACHER_SECRET || null;
  const ids = secret ? await rosterIds(teacherKey) : null;
  const rail = createBonusRail({ rosterUrl: ROSTER, teacherKey, skillTitle: title, log: (...args) => console.warn(...args) });
  let planned = 0, skipped = 0;
  for (const row of rows) {
    if (secret) {
      const studentId = ids.get(row.username);
      if (studentId && await alreadyBanked(studentId, row.skill_id, secret)) { skipped++; continue; }
    }
    planned++;
    console.log((APPLY ? 'post ' : 'would post ') + row.username + ' ' + row.skill_id + ' (' + title(row.skill_id) + ')');
    if (APPLY) {
      const result = await rail.post({ section: row.section, username: row.username, skillId: row.skill_id });
      console.log(result ? '  banked in ' + result.quarter : '  FAILED (see warning above)');
    }
  }
  console.log('planned ' + planned + ', skipped (already banked) ' + skipped + (APPLY ? ', posted ' + rail.posted.length + ', failed ' + rail.failed.length : ''));
  if (APPLY && rail.failed.length) process.exit(1);
}

main().catch(error => { console.error(error.message); process.exit(1); });
