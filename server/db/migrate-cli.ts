import {databasePool} from './pool';
import {migrate} from './migrate';
async function main(){const pool=databasePool();if(!pool)throw Error();try{await migrate(pool);console.log('Database migrations applied.')}finally{await pool.end()}}
main().catch(()=>{console.error('Migration failed. Check DATABASE_URL and database connectivity. No connection details were logged.');process.exitCode=1});
