/**
 * Seeds a working SMARTLAB dataset:
 *   1 laboratory, 30 computers, demo accounts for each role,
 *   ~40 extra users, bookings across a 10-day window, telemetry,
 *   and 24 hours of energy readings.
 *
 * Re-running is safe: existing rows are matched on their natural keys.
 *
 *   npm run seed
 */
import { supabase, TABLES } from '../config/database.js';
import { hashPassword } from '../utils/password.js';

const LAB_NAME = 'Computer Laboratory 1';
const COMPUTER_COUNT = 30;

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (list) => list[randInt(0, list.length - 1)];

const DEMO_USERS = [
  { full_name: 'System Administrator', email: 'admin@smartlab.edu', password: 'Admin@1234', role: 'admin', department: 'IT Services' },
  { full_name: 'Prof. Maria Santos', email: 'faculty@smartlab.edu', password: 'Faculty@1234', role: 'faculty', department: 'Computer Science' },
  { full_name: 'Juan Dela Cruz', email: 'student@smartlab.edu', password: 'Student@1234', role: 'student', department: 'BS Information Technology', id_number: '2024-00001' },
];

const FIRST = ['Ana', 'Ben', 'Carla', 'Diego', 'Elena', 'Franco', 'Grace', 'Hugo', 'Isla', 'Jomar', 'Kiana', 'Luis', 'Mira', 'Noel', 'Olive', 'Paolo', 'Queenie', 'Rico', 'Sofia', 'Tomas'];
const LAST = ['Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Ramos', 'Villanueva', 'Aquino', 'Navarro'];
const DEPTS = ['BS Computer Science', 'BS Information Technology', 'BS Information Systems', 'BS Computer Engineering'];
const PURPOSES = [
  'Programming laboratory exercise',
  'Thesis data analysis',
  'Web development project',
  'Database design activity',
  'Machine learning coursework',
  'Capstone system testing',
  'Network simulation lab',
];

async function upsertLaboratory() {
  const { data: existing } = await supabase
    .from(TABLES.laboratories)
    .select('id')
    .eq('name', LAB_NAME)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from(TABLES.laboratories)
    .insert({ name: LAB_NAME, building: 'Engineering Building', room_number: 'ENG-204', capacity: COMPUTER_COUNT })
    .select('id')
    .single();

  if (error) throw new Error(`laboratory: ${error.message}`);
  return data.id;
}

async function upsertUser(user) {
  const email = user.email.toLowerCase();
  const { data: existing } = await supabase
    .from(TABLES.users)
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from(TABLES.users)
    .insert({
      full_name: user.full_name,
      email,
      password_hash: await hashPassword(user.password),
      role: user.role,
      status: 'active',
      department: user.department ?? null,
      id_number: user.id_number ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`user ${email}: ${error.message}`);
  return data.id;
}

async function seedComputers(labId) {
  const { data: existing } = await supabase
    .from(TABLES.computers)
    .select('id, computer_number')
    .eq('laboratory_id', labId);

  const have = new Set((existing ?? []).map((c) => c.computer_number));
  const toCreate = [];

  for (let i = 1; i <= COMPUTER_COUNT; i += 1) {
    if (have.has(i)) continue;
    toCreate.push({
      computer_number: i,
      name: `PC-${String(i).padStart(2, '0')}`,
      laboratory_id: labId,
      ip_address: `192.168.10.${100 + i}`,
      operating_system: i % 5 === 0 ? 'Ubuntu 22.04 LTS' : 'Windows 11 Pro',
      specs: 'Intel Core i5-12400 / 16GB RAM / 512GB SSD',
      status: 'AVAILABLE',
      is_bookable: true,
    });
  }

  if (toCreate.length) {
    const { error } = await supabase.from(TABLES.computers).insert(toCreate);
    if (error) throw new Error(`computers: ${error.message}`);
  }

  const { data: all, error } = await supabase
    .from(TABLES.computers)
    .select('id, computer_number, name')
    .eq('laboratory_id', labId)
    .order('computer_number');

  if (error) throw new Error(`computers read: ${error.message}`);
  return all;
}

async function seedTelemetry(computers) {
  const now = new Date();
  const rows = computers.map((computer, index) => {
    // A realistic mix: most online, a couple offline, one in maintenance.
    const offline = index === 7 || index === 19;
    return {
      computer_id: computer.id,
      cpu_usage: offline ? 0 : Number(rand(5, 85).toFixed(2)),
      ram_usage: offline ? 0 : Number(rand(25, 90).toFixed(2)),
      disk_usage: Number(rand(35, 80).toFixed(2)),
      temperature: offline ? 0 : Number(rand(38, 72).toFixed(2)),
      uptime_seconds: offline ? 0 : randInt(600, 400_000),
      is_online: !offline,
      heartbeat_at: offline
        ? new Date(now.getTime() - 3 * 3600_000).toISOString()
        : now.toISOString(),
      updated_at: now.toISOString(),
    };
  });

  const { error } = await supabase
    .from(TABLES.computerStatus)
    .upsert(rows, { onConflict: 'computer_id' });

  if (error) throw new Error(`telemetry: ${error.message}`);

  // Reflect the telemetry in the computers table.
  const offlineIds = computers.filter((_, i) => i === 7 || i === 19).map((c) => c.id);
  const inUseIds = computers.filter((_, i) => i % 6 === 2).map((c) => c.id);
  const maintenanceIds = [computers[12].id];

  await supabase.from(TABLES.computers).update({ status: 'AVAILABLE', last_seen_at: now.toISOString() }).in('id', computers.map((c) => c.id));
  await supabase.from(TABLES.computers).update({ status: 'IN_USE' }).in('id', inUseIds);
  await supabase.from(TABLES.computers).update({ status: 'OFFLINE' }).in('id', offlineIds);
  await supabase.from(TABLES.computers).update({ status: 'MAINTENANCE', is_bookable: false }).in('id', maintenanceIds);
}

async function seedEnergy(computers) {
  const { count } = await supabase
    .from(TABLES.energyReadings)
    .select('id', { count: 'exact', head: true })
    .gte('recorded_at', new Date(Date.now() - 86_400_000).toISOString());

  if ((count ?? 0) > 500) {
    console.log('  energy readings already present, skipping');
    return;
  }

  const rows = [];
  const now = Date.now();

  // 24 hours at 15-minute resolution for every computer.
  for (const computer of computers) {
    for (let step = 96; step >= 0; step -= 1) {
      const at = new Date(now - step * 15 * 60_000);
      const hour = at.getHours();
      // Idle overnight, busy during lab hours.
      const busy = hour >= 8 && hour <= 18;
      const watts = busy ? rand(65, 145) : rand(3, 25);
      const voltage = rand(218, 232);

      rows.push({
        computer_id: computer.id,
        voltage: Number(voltage.toFixed(2)),
        current_amp: Number((watts / voltage).toFixed(3)),
        power_watt: Number(watts.toFixed(2)),
        energy_kwh: Number((watts / 1000 / 4).toFixed(5)), // 15 min = 1/4 hour
        temperature: Number(rand(35, 68).toFixed(2)),
        recorded_at: at.toISOString(),
      });
    }
  }

  // Insert in chunks so no single request is oversized.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(TABLES.energyReadings).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`energy: ${error.message}`);
  }

  console.log(`  ${rows.length} energy readings inserted`);
}

async function seedBookings(computers, users) {
  const { count } = await supabase.from(TABLES.bookings).select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 20) {
    console.log('  bookings already present, skipping');
    return;
  }

  const rows = [];
  // One-hour blocks inside the laboratory's opening hours (07:00-17:00).
  const slots = [
    ['07:00:00', '08:00:00'],
    ['08:00:00', '09:00:00'],
    ['09:00:00', '10:00:00'],
    ['10:00:00', '11:00:00'],
    ['13:00:00', '14:00:00'],
    ['14:00:00', '15:00:00'],
    ['15:00:00', '16:00:00'],
    ['16:00:00', '17:00:00'],
  ];

  // The laboratory opens Monday to Thursday, so demo bookings only land on
  // those days — otherwise the sample data would contradict the rule the
  // API enforces.
  const OPEN_DAYS = [1, 2, 3, 4];

  // Five days back through five days forward.
  for (let offset = -8; offset <= 8; offset += 1) {
    const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    if (!OPEN_DAYS.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    const perDay = randInt(4, 9);
    const taken = new Set();

    for (let i = 0; i < perDay; i += 1) {
      const computer = pick(computers);
      const [start_time, end_time] = pick(slots);
      const key = `${computer.id}-${start_time}`;
      if (taken.has(key)) continue;
      taken.add(key);

      const user = pick(users);
      let status;
      if (offset < 0) status = pick(['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
      else if (offset === 0) status = pick(['APPROVED', 'APPROVED', 'PENDING']);
      else status = pick(['PENDING', 'APPROVED', 'APPROVED']);

      rows.push({
        user_id: user.id,
        computer_id: computer.id,
        booking_date: date,
        start_time,
        end_time,
        purpose: pick(PURPOSES),
        status,
        approved_by: status === 'APPROVED' || status === 'COMPLETED' ? users[0].id : null,
        approved_at: status === 'APPROVED' || status === 'COMPLETED' ? new Date().toISOString() : null,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(TABLES.bookings).insert(rows.slice(i, i + 200));
    if (error) throw new Error(`bookings: ${error.message}`);
  }

  console.log(`  ${rows.length} bookings inserted`);
}

async function seedNotifications(userIds) {
  const { count } = await supabase.from(TABLES.notifications).select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 5) return;

  const samples = [
    { title: 'Welcome to SMARTLAB', message: 'Your account is ready. Book a computer from your dashboard.', type: 'info' },
    { title: 'Laboratory maintenance', message: 'PC-13 is under maintenance until further notice.', type: 'warning' },
    { title: 'Booking reminder', message: 'You have an upcoming session this week.', type: 'booking' },
  ];

  const rows = userIds.flatMap((id) => samples.map((s) => ({ ...s, user_id: id })));
  await supabase.from(TABLES.notifications).insert(rows);
}

async function main() {
  console.log('\nSeeding SMARTLAB...\n');

  const labId = await upsertLaboratory();
  console.log('  laboratory ready');

  const demoIds = [];
  for (const user of DEMO_USERS) {
    demoIds.push(await upsertUser(user));
  }
  console.log(`  ${DEMO_USERS.length} demo accounts ready`);

  // A pool of additional users so lists and pagination have real content.
  const extra = [];
  for (let i = 0; i < 40; i += 1) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const role = i < 6 ? 'faculty' : 'student';
    extra.push({
      full_name: `${first} ${last}`,
      email: `${first}.${last}.${i}@smartlab.edu`.toLowerCase(),
      password: 'Smartlab@123',
      role,
      department: pick(DEPTS),
      id_number: role === 'student' ? `2024-${String(1000 + i)}` : null,
    });
  }

  const extraIds = [];
  for (const user of extra) {
    extraIds.push(await upsertUser(user));
  }
  console.log(`  ${extra.length} additional users ready`);

  const computers = await seedComputers(labId);
  console.log(`  ${computers.length} computers ready`);

  await seedTelemetry(computers);
  console.log('  telemetry snapshot written');

  await seedEnergy(computers);

  const allUsers = [...demoIds, ...extraIds].map((id) => ({ id }));
  await seedBookings(computers, allUsers);

  await seedNotifications(demoIds);
  console.log('  notifications ready');

  console.log('\nDone. Sign in with:\n');
  for (const user of DEMO_USERS) {
    console.log(`  ${user.role.padEnd(8)} ${user.email.padEnd(24)} ${user.password}`);
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}\n`);
  process.exit(1);
});
