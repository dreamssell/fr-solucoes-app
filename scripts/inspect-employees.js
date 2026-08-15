import pg from "pg";

const connectionString = "postgresql://postgres:Trocar5enh%40123@db.npealnrgqdumqopjkaeb.supabase.co:5432/postgres";

async function run() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employees'
    `);
    console.log("Columns of employees table:", res.rows);
  } catch (err) {
    console.error("Erro:", err);
  } finally {
    await client.end();
  }
}

run();
