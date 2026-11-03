import {defineConfig} from '@playwright/test';
const port=Number(process.env.LINKLENS_TEST_PORT||3100);
const baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests/e2e',use:{baseURL,headless:true},webServer:{command:`npm run dev -- --port ${port}`,url:baseURL,reuseExistingServer:!process.env.CI,env:{NEXT_DIST_DIR:'.next-e2e'}},projects:[{name:'chromium',use:{browserName:'chromium'}}]});
