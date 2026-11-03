import {test,expect} from '@playwright/test';
test('real structural scan saves a private redacted report in Neon',async({page})=>{
 test.skip(process.env.LINKLENS_REAL_TESTS!=='1','Requires HTTP adapter and the API with configured database.');
 const targetRequests:string[]=[];page.on('request',r=>{if(new URL(r.url()).hostname==='paypal.com.attacker.co.uk')targetRequests.push(r.url())});
 await page.goto('/');await expect(page.getByRole('checkbox').nth(0)).toBeDisabled();await expect(page.getByRole('checkbox').nth(1)).toBeDisabled();
 await page.getByLabel('Payment link or website URL').fill('https://paypal.com.attacker.co.uk/SECRET?token=SENTINEL#PRIVATE');
 await page.getByRole('button',{name:'Analyse link',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Suspicious',exact:true})).toBeVisible({timeout:15000});
 await expect(page.getByText('DOM-001',{exact:true})).toBeVisible();await expect(page.getByText('attacker.co.uk',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Demo mode',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Suspicious',exact:true})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download redacted JSON'}).click();const download=await pending;const stream=await download.createReadStream();let json='';for await(const chunk of stream!)json+=chunk.toString();expect(json).not.toMatch(/SECRET|SENTINEL|PRIVATE/);
 await page.getByRole('button',{name:'Delete this report'}).click();await page.getByRole('button',{name:'Delete report',exact:true}).click();await expect(page.getByRole('heading',{name:'Report deleted.'})).toBeVisible();expect(targetRequests).toEqual([]);
});
