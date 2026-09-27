import {campusJson} from "../../lib/college-access";
import {env} from "@/lib/runtime-env";
import {requireRequestUser} from "../../lib/current-user";
import {requireAdmin,audit,superAdmin} from "../../lib/admin";
const moderator=requireAdmin;
export async function GET(request:Request){const u=await moderator(request);if(u instanceof Response)return u;try{const reports=await env.DB.prepare(`SELECT r.id,r.target_type AS targetType,r.target_id AS targetId,r.reason,r.state,r.created_at AS createdAt,
 CASE WHEN r.target_type='post' THEN(SELECT title||': '||detail FROM posts WHERE id=r.target_id) WHEN r.target_type='comment' THEN(SELECT body FROM post_comments WHERE id=r.target_id) WHEN r.target_type='user' THEN(SELECT display_name FROM profiles WHERE user_id=r.target_id) WHEN r.target_type='circle' THEN(SELECT name||': '||description FROM circles WHERE id=r.target_id) WHEN r.target_type='message' THEN(SELECT body FROM connection_messages WHERE id=r.target_id) ELSE NULL END AS content
 FROM safety_reports r ORDER BY CASE WHEN r.state='open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`).all();const suspended=await env.DB.prepare("SELECT s.user_id AS userId,p.display_name AS displayName,s.created_at AS createdAt FROM campus_suspensions s LEFT JOIN profiles p ON p.user_id=s.user_id ORDER BY s.created_at DESC LIMIT 100").all();return campusJson({reports:reports.results??[],suspended:suspended.results??[]},{headers:{"Cache-Control":"no-store"}});}catch{return campusJson({error:"Report review is unavailable. Retry."},{status:503});}}
export async function PATCH(request:Request){const u=await moderator(request);if(u instanceof Response)return u;let d:Record<string,unknown>;try{const raw=await request.text();if(raw.length>1200)return campusJson({error:"Request too large."},{status:413});d=JSON.parse(raw);}catch{return campusJson({error:"Send a valid review action."},{status:400});}
 const action=d.action,id=typeof d.reportId==="string"?d.reportId:"";
 try{
  if(action==="restore-student"&&typeof d.userId==="string"){await env.DB.batch([env.DB.prepare("DELETE FROM campus_suspensions WHERE user_id=?").bind(d.userId),audit(u.email,"restore-student",d.userId)]);return campusJson({restored:true});}
  const report=await env.DB.prepare("SELECT target_type AS targetType,target_id AS targetId FROM safety_reports WHERE id=? AND state='open'").bind(id).first<{targetType:string;targetId:string}>();
  if(!report)return campusJson({error:"Open report not found."},{status:404});
  const statements:D1PreparedStatement[]=[];
  if(action==="remove-content"){
   if(report.targetType==="post")statements.push(env.DB.prepare("UPDATE posts SET status='removed' WHERE id=?").bind(report.targetId));
   else if(report.targetType==="comment")statements.push(env.DB.prepare("DELETE FROM post_comments WHERE id=?").bind(report.targetId));
   else if(report.targetType==="circle")statements.push(env.DB.prepare("UPDATE circles SET visibility='removed' WHERE id=?").bind(report.targetId));
   else if(report.targetType==="message")statements.push(env.DB.prepare("DELETE FROM connection_messages WHERE id=?").bind(report.targetId));
   else return campusJson({error:"This report isn't removable content."},{status:400});
  }else if(action==="suspend-student"&&report.targetType==="user"){
   const target=await env.DB.prepare("SELECT email FROM profiles WHERE user_id=?").bind(report.targetId).first<{email:string}>();if(target&&(superAdmin(target.email)||await env.DB.prepare("SELECT user_id FROM admin_members WHERE user_id=?").bind(report.targetId).first()))return campusJson({error:"Remove the admin role before suspending this account. Super Admin access is protected."},{status:403});
   if(report.targetId===u.userId)return campusJson({error:"A moderator cannot suspend their own account."},{status:400});
   statements.push(env.DB.prepare("INSERT INTO campus_suspensions(user_id,moderator_user_id,created_at) SELECT user_id,?,? FROM profiles WHERE user_id=? ON CONFLICT(user_id) DO NOTHING").bind(u.userId,Date.now(),report.targetId),env.DB.prepare("UPDATE profiles SET discovery_enabled=0 WHERE user_id=?").bind(report.targetId),env.DB.prepare("UPDATE requests SET state='cancelled',sender_shared_contact=0,recipient_shared_contact=0 WHERE sender_user_id=? OR recipient_user_id=?").bind(report.targetId,report.targetId));
  }else if(action!=="dismiss")return campusJson({error:"Choose a valid review action."},{status:400});
  statements.push(env.DB.prepare("UPDATE safety_reports SET state=? WHERE id=? AND state='open'").bind(action==="dismiss"?"dismissed":"resolved",id));statements.push(audit(u.email,String(action),id));await env.DB.batch(statements);return campusJson({reviewed:true});
 }catch{return campusJson({error:"Could not apply review. Retry."},{status:503});}
}
