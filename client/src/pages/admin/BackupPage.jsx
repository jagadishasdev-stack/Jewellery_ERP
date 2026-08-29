/**
 * Backup — genuinely absent before (no backup/restore capability existed
 * anywhere). Deliberately scoped to ONLY the safe direction: an
 * on-demand, read-only export of this tenant's own data as a downloadable
 * JSON file. There is no Restore here, and none is planned in this pass —
 * a broken restore could destroy real production data; that needs a much
 * more careful, separately-reviewed effort, not a guess.
 */
import React, { useState } from 'react';
import { Card, Button, Table, Typography, message, Alert, Space } from 'antd';
import { DownloadOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { backupApi } from '../../api/modules';

const { Text } = Typography;

export default function BackupPage() {
  const [exporting, setExporting] = useState(false);

  const { data: tables, isLoading } = useQuery({
    queryKey: ['backup-tables'],
    queryFn: () => backupApi.tables().then((r) => r.data.data || []),
  });

  const totalRows = (tables || []).reduce((s, t) => s + (t.rows || 0), 0);

  const runExport = async () => {
    setExporting(true);
    try {
      const res = await backupApi.export();
      const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      message.success('Backup downloaded.');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to export backup.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="page-header-title">Backup</div>
          <div className="page-header-sub">Export your data — {totalRows.toLocaleString()} rows across {tables?.length || 0} tables</div>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={runExport}
          style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          Download Backup
        </Button>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="This exports your data — it does not restore it"
        description="Downloads every table's rows for your business as a single JSON file, for safekeeping. There is no restore feature yet — bringing a backup back into the system would need a separate, carefully-reviewed process to make sure it can never overwrite live data by mistake."
      />

      <Card className="erp-card" title={<span><DatabaseOutlined style={{ color: '#B8860B' }} /> What gets exported</span>}>
        <Table
          size="small" loading={isLoading} dataSource={tables || []} rowKey="table"
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Table', dataIndex: 'table' },
            { title: 'Rows', dataIndex: 'rows', align: 'right', render: (v) => v == null ? <Text type="secondary">-</Text> : v.toLocaleString() },
          ]}
        />
      </Card>
    </div>
  );
}
