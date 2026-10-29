import {detail} from '@/lib/public-api/housing';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{source:string;id:string}>}){const {source,id}=await params;return detail('notices',request,source,id);}
