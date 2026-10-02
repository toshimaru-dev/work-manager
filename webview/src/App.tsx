import { useState } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@tremor/react';
import {
  RiCalendarScheduleLine,
  RiDashboardLine,
  RiFileList3Line,
  RiFlagLine,
  RiHashtag,
  RiSettings3Line,
  RiTableLine,
} from '@remixicon/react';
import { currentMonth } from './lib/date';
import { Dashboard } from './pages/Dashboard';
import { Entries } from './pages/Entries';
import { Import } from './pages/Import';
import { Summary } from './pages/Summary';
import { Goals } from './pages/Goals';
import { Settings } from './pages/Settings';
import { Codes } from './pages/Codes';

export function App() {
  const [tab, setTab] = useState(0);
  // 月の選択はタブ間で共有する
  const [month, setMonth] = useState(currentMonth());
  const monthProps = { month, onMonthChange: setMonth };

  return (
    <div className="min-h-screen bg-tremor-background-muted text-tremor-content dark:bg-gray-950 dark:text-dark-tremor-content">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <TabGroup index={tab} onIndexChange={setTab}>
          <TabList variant="line" className="flex-wrap">
            <Tab icon={RiDashboardLine}>ダッシュボード</Tab>
            <Tab icon={RiFileList3Line}>稼働入力</Tab>
            <Tab icon={RiCalendarScheduleLine}>予定取込</Tab>
            <Tab icon={RiTableLine}>月次集計</Tab>
            <Tab icon={RiFlagLine}>人事目標</Tab>
            <Tab icon={RiHashtag}>コード管理</Tab>
            <Tab icon={RiSettings3Line}>設定</Tab>
          </TabList>
          <TabPanels className="mt-6">
            <TabPanel>
              <Dashboard {...monthProps} onNavigate={setTab} />
            </TabPanel>
            <TabPanel>
              <Entries {...monthProps} />
            </TabPanel>
            <TabPanel>
              <Import />
            </TabPanel>
            <TabPanel>
              <Summary {...monthProps} onNavigate={setTab} />
            </TabPanel>
            <TabPanel>
              <Goals />
            </TabPanel>
            <TabPanel>
              <Codes />
            </TabPanel>
            <TabPanel>
              <Settings />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>
    </div>
  );
}
