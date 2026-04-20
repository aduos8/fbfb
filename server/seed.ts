import "dotenv/config";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: false });

async function seed() {
  console.log("Starting seed...");

  const email = "b@b.com";
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 12);

  const [existing] = await sql`
    SELECT id FROM users WHERE email = ${email.toLowerCase()}
  `;

  if (existing) {
    console.log(`User ${email} exists, updating role to owner...`);
    await sql`
      UPDATE users SET role = 'owner', updated_at = NOW() WHERE email = ${email.toLowerCase()}
    `;
  } else {
    console.log(`Creating user ${email} as owner...`);
    const [user] = await sql`
      INSERT INTO users (username, email, password_hash, role, status, email_verified)
      VALUES ('b', ${email.toLowerCase()}, ${passwordHash}, 'owner', 'active', true)
      RETURNING id
    `;

    await sql`
      INSERT INTO credits (user_id, balance) VALUES (${user.id}, 100)
    `;
  }

  const [user] = await sql`
    SELECT id, email, role FROM users WHERE email = ${email.toLowerCase()}
  `;
  console.log(`Done! User: ${user.email}, Role: ${user.role}`);
  console.log(`Login with: email=${email}, password=${password}`);

  await sql.end();
}

seed().catch(console.error);
