const { PGlite } = require('@electric-sql/pglite');
async function testDatabase() {
  const db = await PGlite.create();
  const query = async (sql,params) => {
    const result = params ? await db.query(sql,params) : (await db.exec(sql)).at(-1);
    return { ...result, rows:result?.rows || [], rowCount:result?.affectedRows || result?.rows?.length || 0 };
  };
  let tail = Promise.resolve();
  const pool = { query, end:async()=>{}, connect:async()=>{
    const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;
    return { query, release };
  }};
  return { db,pool };
}
module.exports={testDatabase};
