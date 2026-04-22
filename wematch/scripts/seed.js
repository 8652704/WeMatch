// scripts/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb } = require('../backend/config/database');

const db = getDb();

const users = [
  { name: 'Alex Chen',    email: 'alex@demo.com',    password: 'password123', age: 28, gender: 'man',    location: 'San Francisco, CA', bio: 'Software engineer who loves hiking, coffee, and bad puns.', interests: '["hiking","coffee","coding","travel"]' },
  { name: 'Jordan Lee',   email: 'jordan@demo.com',  password: 'password123', age: 26, gender: 'woman',  location: 'New York, NY',      bio: 'Designer & yoga teacher. Lover of great food and good books.', interests: '["yoga","design","food","books"]' },
  { name: 'Sam Rivera',   email: 'sam@demo.com',     password: 'password123', age: 30, gender: 'nonbinary', location: 'Austin, TX',     bio: 'Musician and dog parent. Allergic to small talk.', interests: '["music","dogs","concerts","cooking"]' },
  { name: 'Morgan Davis', email: 'morgan@demo.com',  password: 'password123', age: 27, gender: 'woman',  location: 'Chicago, IL',       bio: 'Marketing lead by day, amateur chef by night.', interests: '["cooking","marketing","wine","cycling"]' },
  { name: 'Taylor Kim',   email: 'taylor@demo.com',  password: 'password123', age: 29, gender: 'man',    location: 'Los Angeles, CA',   bio: 'Film director chasing stories worth telling.', interests: '["film","photography","travel","fitness"]' },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password, name, age, gender, location, bio, interests)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const ids = {};
for (const u of users) {
  const id = uuid();
  ids[u.email] = id;
  insert.run(id, u.email, bcrypt.hashSync(u.password, 10), u.name, u.age, u.gender, u.location, u.bio, u.interests);
  console.log(`  ✓ Created user: ${u.name} (${u.email})`);
}

// Alex invites Jordan into his circle
const c1 = uuid();
db.prepare("INSERT OR IGNORE INTO circles (id, owner_id, member_id, status) VALUES (?, ?, ?, 'accepted')")
  .run(c1, ids['alex@demo.com'], ids['jordan@demo.com']);

// Jordan refers Sam to Alex
const r1 = uuid();
db.prepare("INSERT OR IGNORE INTO referrals (id, referrer_id, recipient_id, candidate_id, note) VALUES (?, ?, ?, ?, ?)")
  .run(r1, ids['jordan@demo.com'], ids['alex@demo.com'], ids['sam@demo.com'], "You two both love hiking and live music — I had to connect you!");

console.log('\n✅  Seed complete!');
console.log('\nDemo logins:');
users.forEach(u => console.log(`  ${u.email}  /  password123`));
process.exit(0);
