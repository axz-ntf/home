import { adminNav } from '@/lib/admin-nav';
import { getAdminUser } from '@/lib/admin-user';
import AdminShell from '../admin-shell';
import { getAutomationData } from './automation-data';
import AutomationDashboard from './automation-dashboard';
import './automation.css';
export const dynamic='force-dynamic';
export default async function AutomationPage(){
 const data=await getAutomationData();
 return <AdminShell pageTitle="수집 현황" pageSub="저장된 자료와 최근 처리 결과" navItems={adminNav()} user={getAdminUser()}><AutomationDashboard data={data}/></AdminShell>;
}
