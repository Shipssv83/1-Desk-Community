const db = require('./config/db');
const bcrypt = require('bcrypt');
const env = require('./config/env');

async function seed() {
  try {
    // 1. Check if user already exists
    const userCount = await db.user.count();
    
    if (userCount > 0) {
      console.log('Database already has users. Skipping seed.');
      return;
    }

    console.log('Running database seed...');

    // 2. Hash password and insert admin
    const email = env.adminEmail;
    const password = env.adminPassword;
    const passwordHash = await bcrypt.hash(password, 12);

    const adminUser = await db.user.create({
      data: {
        email: email.toLowerCase(),
        name: 'Администратор',
        passwordHash,
        role: 'admin',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    console.log(`Created admin user: ${adminUser.email}`);

    // 3. Create a starter Telegram inbox. Add your bot token in the operator UI
    //    (Channels → edit) — that registers the Telegram webhook automatically.
    const inbox = await db.inbox.create({
      data: {
        name: 'Telegram',
        channelType: 'telegram',
        channelConfig: { bot_token: '' },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        channelType: true
      }
    });
    console.log(`Created starter Telegram inbox: ${inbox.name} (ID: ${inbox.id})`);
    console.log('Seed completed successfully.');

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

module.exports = seed;
