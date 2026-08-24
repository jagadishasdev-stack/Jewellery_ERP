/**
 * Excel Bulk Import — admin-only (gated by the `tenant_management`
 * permission, same level as every other screen under Admin).
 *
 * Deliberately two real, working import types (Stock, Customers) rather
 * than a fake "any spreadsheet, any table" universal importer — writes
 * straight into tbl_ornament_master / tbl_customer_master, the same
 * tables every report already reads from, so imported data shows up in
 * Inventory/Customer reports immediately with no separate sync step.
 */
import React, { useState, useRef } from 'react';
import {
  Typography, Card, Select, Upload, Button, Space, Table, Tag, Alert, message, Result,
} from 'antd';
import { UploadOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { excelImportApi } from '../../api/modules';
import PageTour from '../../components/PageTour';

const { Title, Text } = Typography;
const { Option } = Select;
const { Dragger } = Upload;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // must match server/src/routes/excelImport.js's multer limit

const IMPORT_TYPES = {
  stock: { label: 'Stock / Ornaments', fn: excelImportApi.importStock, columns: ['Article Number', 'Item Type', 'Design Code', 'Purity', 'Gross Weight', 'Net Weight', 'Stone Weight', 'Making Charge Per Gram', 'Purchase Cost', 'Quantity', 'Hallmark Certificate No'] },
  customers: { label: 'Customers', fn: excelImportApi.importCustomers, columns: ['Customer Name', 'Mobile', 'Email', 'Address', 'City', 'State', 'Pincode', 'PAN', 'GST No'] },
  itemtypes: { label: 'Item Types', fn: excelImportApi.importItemTypes, columns: ['Type Code', 'Type Name', 'Category', 'HSN Code', 'GST Percentage', 'Default Making Charge', 'Default Wastage Percent', 'Is Gold', 'Is Silver'], global: true },
  designs: { label: 'Designs', fn: excelImportApi.importDesigns, columns: ['Design Code', 'Design Name', 'Item Type Code', 'Collection Name', 'Category', 'Estimated Gold Weight', 'Estimated Stone Weight', 'Estimated Making Charge', 'Estimated Wastage Percent'], global: true },
  purity: { label: 'Purity Master', fn: excelImportApi.importPurity, columns: ['Purity Code', 'Karat', 'Percentage', 'Description', 'Hallmark Standard'], global: true },
  gemstones: { label: 'Gemstones', fn: excelImportApi.importGemstones, columns: ['Stone Code', 'Stone Name', 'Color', 'Clarity', 'Cut', 'Price Per Carat', 'Is Natural', 'Is Lab Grown'], global: true },
  vendors: { label: 'Vendors / Karigars', fn: excelImportApi.importVendors, columns: ['Vendor Type (Supplier or Karigar)', 'Vendor Name', 'Contact Person', 'Mobile', 'Email', 'Address', 'City', 'State', 'GST No', 'Opening Balance'] },
};

export default function ExcelImportPage() {
  const [type, setType] = useState('stock');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const typeRef = useRef(null);
  const uploadRef = useRef(null);
  const tourSteps = [
    { title: '1. Pick What You\'re Importing', description: 'Stock, Customers, Item Types, Designs, Purity, Gemstones, or Vendors/Karigars — each has its own expected column layout. Item Types, Designs, Purity and Gemstones are shared master lists across the whole platform, not private to your shop — you\'ll see a note when that applies.', target: () => typeRef.current },
    { title: '2. Download the Template First', description: 'Grab the blank template for the type you picked so your column headers match exactly what the importer expects.', target: () => uploadRef.current },
    { title: '3. Upload & Save', description: 'Choose your filled-in file and click Save Import — rows that don\'t match anything (unknown item type, duplicate article number, missing mobile number) are skipped and listed individually, never guessed at or silently dropped. Everything that does import shows up in your normal reports right away.' },
  ];

  const importMutation = useMutation({
    mutationFn: () => IMPORT_TYPES[type].fn(file),
    onSuccess: (res) => {
      setResult(res.data.data);
      message.success(res.data.message);
    },
    onError: (err) => message.error(err.response?.data?.message || 'Import failed.'),
  });

  const downloadTemplate = async () => {
    const res = await excelImportApi.downloadTemplate(type);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_import_template.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><FileExcelOutlined style={{ color: '#217346' }} />Excel Bulk Import</Space></Title>
      </div>

      <Card style={{ borderRadius: 8, maxWidth: 640 }}>
        <div ref={typeRef}>
          <Text strong style={{ fontSize: 12 }}>What are you importing?</Text>
          <Select value={type} onChange={(v) => { setType(v); setFile(null); setResult(null); }} style={{ width: '100%', marginTop: 6, marginBottom: 16 }}>
            {Object.entries(IMPORT_TYPES).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
        </div>

        <Alert
          style={{ marginBottom: 16 }}
          type="info" showIcon
          message={`Expected columns for ${IMPORT_TYPES[type].label}`}
          description={IMPORT_TYPES[type].columns.join(', ')}
        />

        {IMPORT_TYPES[type].global && (
          <Alert
            style={{ marginBottom: 16 }}
            type="warning" showIcon
            message="Shared master list"
            description={`${IMPORT_TYPES[type].label} is a platform-wide catalog, not private to your shop — anything you import here becomes available to every tenant on this ERP, the same as adding one manually from its admin screen. Existing codes are never overwritten.`}
          />
        )}

        <div ref={uploadRef}>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate} style={{ marginBottom: 16 }}>
            Download {IMPORT_TYPES[type].label} Template
          </Button>

          <Dragger
            accept=".xlsx,.xls,.csv"
            maxCount={1}
            beforeUpload={(f) => {
              if (f.size > MAX_FILE_SIZE) {
                message.error(`"${f.name}" is ${(f.size / (1024 * 1024)).toFixed(1)}MB — the limit is 5MB. Split large sheets into smaller batches.`);
                return Upload.LIST_IGNORE;
              }
              setFile(f);
              setResult(null);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={file ? [file] : []}
          >
            <p className="ant-upload-drag-icon"><UploadOutlined style={{ color: '#B8860B' }} /></p>
            <p>Click or drag your filled-in Excel file here</p>
            <p className="ant-upload-hint" style={{ fontSize: 11 }}>.xlsx, .xls, or .csv — up to 5MB per file (roughly 20,000–50,000 rows depending on column count)</p>
          </Dragger>
        </div>

        <Button
          type="primary" block size="large"
          disabled={!file}
          loading={importMutation.isPending}
          style={{ background: '#B8860B', borderColor: '#B8860B', marginTop: 16 }}
          onClick={() => importMutation.mutate()}
        >
          Save Import
        </Button>
      </Card>

      {result && (
        <Card style={{ borderRadius: 8, maxWidth: 640, marginTop: 16 }}>
          <Result
            status={result.skipped === 0 ? 'success' : 'warning'}
            title={`${result.imported} of ${result.totalRows} rows imported`}
            subTitle={result.skipped > 0 ? `${result.skipped} row(s) were skipped — see details below. Nothing was guessed or overwritten.` : 'All rows imported cleanly.'}
          />
          {result.errors.length > 0 && (
            <Table
              size="small" pagination={{ pageSize: 10 }}
              dataSource={result.errors.map((e, i) => ({ key: i, message: e }))}
              columns={[{ title: 'Skipped rows', dataIndex: 'message', render: (v) => <Text type="warning" style={{ fontSize: 12 }}>{v}</Text> }]}
            />
          )}
        </Card>
      )}

      <PageTour steps={tourSteps} />
    </div>
  );
}
