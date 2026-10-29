import {list} from '@/lib/public-api/housing';
export const dynamic='force-dynamic';
export async function GET(request:Request){return list('complexes',request);}
