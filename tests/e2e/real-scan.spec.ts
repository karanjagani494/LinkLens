import {test,expect} from '@playwright/test';
test('real structural scan saves a private redacted report in Neon',async({page})=>{
 test.skip(process.env.LINKLENS_REAL_TESTS!=='1','Requires HTTP adapter and the API with configured database.');
 const targetRequests:string[]=[];page.on('request',r=>{if(new URL(r.url()).hostname==='paypal.com.attacker.co.uk')targetRequests.push(r.url())});
 await page.goto('/');const health=await page.request.get(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/health`);const info=await health.json();if(info.capabilities.reputation)await expect(page.getByRole('checkbox').nth(0)).toBeEnabled();else await expect(page.getByRole('checkbox').nth(0)).toBeDisabled();
 await page.getByLabel('Payment link or website URL').fill('https://paypal.com.attacker.co.uk/SECRET?token=SENTINEL#PRIVATE');
 const accepted=page.waitForResponse(r=>r.url().endsWith('/api/scans')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Analyse link',exact:true}).click();
 const creation=await accepted;expect(creation.status()).toBe(process.env.LINKLENS_EXPECT_QUEUE==='1'?202:201);
 await expect(page.getByRole('heading',{name:'Suspicious',exact:true})).toBeVisible({timeout:15000});
 await expect(page.getByText('DOM-001',{exact:true})).toBeVisible();await expect(page.getByText('attacker.co.uk',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Demo mode',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Suspicious',exact:true})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download redacted JSON'}).click();const download=await pending;const stream=await download.createReadStream();let json='';for await(const chunk of stream!)json+=chunk.toString();expect(json).not.toMatch(/SECRET|SENTINEL|PRIVATE/);
 await page.getByRole('button',{name:'Delete this report'}).click();await page.getByRole('button',{name:'Delete report',exact:true}).click();await expect(page.getByRole('heading',{name:'Report deleted.'})).toBeVisible();expect(targetRequests).toEqual([]);
});

 test('live portfolio reputation scan completes and deletes its report',async({page})=>{
 test.skip(process.env.LINKLENS_REPUTATION_TESTS!=='1','Explicit live Google and hosted-service check.');
 await page.goto('/');const checkbox=page.getByRole('checkbox').nth(0);await expect(checkbox).toBeEnabled();await checkbox.check();
 await page.getByLabel('Payment link or website URL').fill('https://example.com');await page.getByRole('button',{name:'Analyse link',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Analysis report',exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByText('No match returned by Google Safe Browsing for every observed destination. This is not a guarantee.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Analysis report',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Delete this report'}).click();await page.getByRole('button',{name:'Delete report',exact:true}).click();await expect(page.getByRole('heading',{name:'Report deleted.'})).toBeVisible();
 });
