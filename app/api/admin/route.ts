import {env} from "@/lib/runtime-env";
import {requireAdmin,audit,emailSettings,seal,superAdmin,type EmailSettings} from "../../lib/admin";
import {campusJson} from "../../lib/college-access";
export async function GET(request:Request){const u=await requireAdmin(request);if(u instanceof Response)return u;
 try{
 const summary=await env.DB.prepare(`SELECT (SELECT count(*) FROM profiles) AS students,(SELECT count(*) FROM college_verifications WHERE verified_email IS NOT NULL) AS verified,(SELECT count(*) FROM circles WHERE visibility!='removed') AS circles,(SELECT count(*) FROM posts WHERE status!='removed') AS posts,(SELECT count(*) FROM safety_reports WHERE state='open') AS reports`).first();
 const users=await env.DB.prepare("SELECT p.user_id AS id,p.display_name AS name,p.email,p.school,p.year,EXISTS(SELECT 1 FROM admin_members a WHERE a.user_id=p.user_id) AS admin FROM profiles p WHERE p.display_name LIKE ? OR p.email LIKE ? ORDER BY p.created_at DESC LIMIT 50").bind('%'+(new URL(request.url).searchParams.get('q')??'').slice(0,100)+'%','%'+(new URL(request.url).searchParams.get('q')??'').slice(0,100)+'%').all();
 const logs=await env.DB.prepare("SELECT actor,action,target,created_at AS createdAt FROM admin_audit ORDER BY created_at DESC LIMIT 100").all();
 const settings=u.role==='super_admin'?await emailSettings():null;
 return campusJson({role:u.role,summary,users:users.results,logs:logs.results,email:u.role==='super_admin'?{configured:!!settings,provider:settings?.provider??'brevo',sender:settings?.sender??'',storageReady:!!env.ADMIN_SETTINGS_KEY}:null});
 }catch{return campusJson({error:"Admin dashboard could not load. Retry."},{status:503});}}
export async function POST(request:Request){const u=await requireAdmin(request,true);if(u instanceof Response)return u;
 try{const raw=await request.text();if(raw.length>8192)return campusJson({error:"Request too large."},{status:413});const d=JSON.parse(raw);
 if(d.action==='grant-admin'||d.action==='revoke-admin'){
 if(typeof d.userId!=='string')return campusJson({error:"Choose a student."},{status:400});
 const target=await env.DB.prepare("SELECT user_id,email FROM profiles WHERE user_id=?").bind(d.userId).first<{user_id:string;email:string}>();
 if(!target||superAdmin(target.email))return campusJson({error:"Choose an existing student. The Super Admin cannot be changed here."},{status:400});
 await env.DB.batch([d.action==='grant-admin'?env.DB.prepare("INSERT INTO admin_members(user_id,created_at)VALUES(?,?)ON CONFLICT(user_id)DO NOTHING").bind(target.user_id,Date.now()):env.DB.prepare("DELETE FROM admin_members WHERE user_id=?").bind(target.user_id),audit(u.email,d.action,target.user_id)]);return campusJson({ok:true});}
 if(d.action==='save-email'){
 if(!['brevo','resend'].includes(d.provider)||typeof d.sender!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.sender)||d.sender.length>254)return campusJson({error:"Choose a provider and valid verified sender address."},{status:400});
 const previous=await emailSettings();const key=typeof d.key==='string'&&d.key.trim()?d.key.trim():previous&&previous.provider===d.provider?previous.key:'';
 if(key.length<10||key.length>4096)return campusJson({error:"Enter the provider API key."},{status:400});
 const settings:EmailSettings={provider:d.provider,sender:d.sender.trim(),key};
 await env.DB.batch([env.DB.prepare("INSERT INTO admin_settings(id,encrypted,updated_at)VALUES('email',?,?)ON CONFLICT(id)DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at").bind(await seal(settings),Date.now()),audit(u.email,'save-email',settings.provider)]);return campusJson({ok:true});}
 if(d.action==='test-email'){
 const settings=await emailSettings();if(!settings)return campusJson({error:"Save email settings first."},{status:400});
 const r=await fetch(settings.provider==='brevo'?'https://api.brevo.com/v3/senders':'https://api.resend.com/domains',{headers:settings.provider==='brevo'?{'api-key':settings.key}:{Authorization:`Bearer ${settings.key}`},signal:AbortSignal.timeout(10000)});
 await audit(u.email,'test-email',settings.provider).run();return campusJson({ok:r.ok,message:r.ok?'Provider accepted the key. Verify your sender in the provider dashboard; a student code request is still needed to confirm delivery.':'Provider rejected this check. Check the key and its permissions.'});}
 return campusJson({error:"Unknown admin action."},{status:400});
 }catch{return campusJson({error:"Admin action failed. Check the settings and retry."},{status:503});}}
