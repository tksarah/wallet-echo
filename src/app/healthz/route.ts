import {bindings} from '@/lib/storage';
export async function GET(){try{const {DB}=await bindings();await DB.prepare('SELECT id FROM state_revision LIMIT 1').all();return Response.json({status:'ok'});}catch{return Response.json({status:'unavailable'},{status:503});}}
