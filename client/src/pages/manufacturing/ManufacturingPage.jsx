import React, { useState, useRef } from 'react';
import { Typography, Tabs, Tag, Button, Space, message, InputNumber, Table, Modal, Form } from 'antd';
import { BuildOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { manufacturingApi } from '../../api/modules';
import GenericCrudTab from '../../components/GenericCrudTab';
import PageTour from '../../components/PageTour';
import dayjs from 'dayjs';

const { Title } = Typography;

function DepartmentsTab() {
  return (
    <GenericCrudTab
      queryKey={['mfg-departments']} listFn={manufacturingApi.getDepartments} createFn={manufacturingApi.createDepartment}
      title="New Department" rowKey="Dept_ID"
      fields={[
        { name: 'Dept_Code', label: 'Department Code', required: true },
        { name: 'Dept_Name', label: 'Department Name', required: true, placeholder: 'e.g. Casting, Filing, Polishing' },
        { name: 'Sequence_No', label: 'Routing Sequence No.', type: 'number' },
      ]}
      columns={[
        { title: 'Code', dataIndex: 'Dept_Code' },
        { title: 'Name', dataIndex: 'Dept_Name' },
        { title: 'Sequence', dataIndex: 'Sequence_No' },
      ]}
    />
  );
}

function BomTab() {
  return (
    <GenericCrudTab
      queryKey={['bom']} listFn={manufacturingApi.getBoms} createFn={manufacturingApi.createBom}
      title="New BOM" rowKey="BOM_ID"
      fields={[
        { name: 'BOM_Name', label: 'BOM Name', required: true },
        { name: 'Design_ID', label: 'Design ID', type: 'number' },
        { name: 'Type_ID', label: 'Item Type ID', type: 'number' },
        { name: 'Standard_Gold_Weight', label: 'Standard Gold Weight (g)', type: 'number', step: 0.001 },
        { name: 'Standard_Wastage_Pct', label: 'Standard Wastage %', type: 'number', step: 0.1, initialValue: 3 },
        { name: 'Standard_Labour_Amount', label: 'Standard Labour (₹)', type: 'number' },
      ]}
      columns={[
        { title: 'BOM Name', dataIndex: 'BOM_Name' },
        { title: 'Version', dataIndex: 'Version' },
        { title: 'Gold Wt', dataIndex: 'Standard_Gold_Weight' },
        { title: 'Wastage %', dataIndex: 'Standard_Wastage_Pct' },
      ]}
    />
  );
}

function ProductionTab() {
  const qc = useQueryClient();
  const { data: departments } = useQuery({ queryKey: ['mfg-departments'], queryFn: () => manufacturingApi.getDepartments().then((r) => r.data.data) });
  const [completeModal, setCompleteModal] = useState(null);
  const [form] = Form.useForm();

  const complete = async (values) => {
    try {
      await manufacturingApi.completeProduction(completeModal, values);
      message.success('Production transaction completed.');
      qc.invalidateQueries({ queryKey: ['production'] });
      setCompleteModal(null);
    } catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };

  return (
    <div>
      <GenericCrudTab
        queryKey={['production']} listFn={manufacturingApi.getProduction} createFn={manufacturingApi.createProduction}
        title="Open Production Transaction" rowKey="Txn_ID"
        fields={[
          { name: 'Dept_ID', label: 'Department', type: 'select', required: true, options: (departments || []).map((d) => ({ value: d.Dept_ID, label: d.Dept_Name })) },
          { name: 'Karigar_ID', label: 'Karigar (Vendor) ID', type: 'number' },
          { name: 'Ornament_ID', label: 'Ornament ID (optional)', type: 'number' },
          { name: 'Txn_Date', label: 'Date', type: 'date', required: true, initialValue: dayjs() },
          { name: 'Input_Weight', label: 'Input Weight (g)', type: 'number', step: 0.001, required: true },
        ]}
        columns={[
          { title: 'Date', dataIndex: 'Txn_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
          { title: 'Dept', dataIndex: 'Dept_Name' },
          { title: 'Karigar', dataIndex: 'Karigar_Name' },
          { title: 'Input Wt', dataIndex: 'Input_Weight' },
          { title: 'Output Wt', dataIndex: 'Output_Weight', render: (v) => v ?? '-' },
          { title: 'Wastage %', dataIndex: 'Wastage_Pct', render: (v) => v ?? '-' },
          { title: 'Status', dataIndex: 'Status', render: (v) => <Tag color={v === 'Completed' ? 'green' : 'orange'}>{v}</Tag> },
          { title: 'Actions', render: (_, r) => r.Status === 'In Progress' && <Button size="small" onClick={() => setCompleteModal(r.Txn_ID)}>Complete</Button> },
        ]}
      />
      <Modal title="Complete Production" open={!!completeModal} onCancel={() => setCompleteModal(null)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={complete}>
          <Form.Item name="Output_Weight" label="Actual Output Weight (g)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} step={0.001} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ background: '#B8860B', borderColor: '#B8860B' }}>Complete</Button>
        </Form>
      </Modal>
    </div>
  );
}

function MeltingRefiningTab() {
  return (
    <GenericCrudTab
      queryKey={['melting-refining']} listFn={manufacturingApi.getMeltingRefining} createFn={manufacturingApi.createMeltingRefining}
      title="New Melting/Refining Log" rowKey="Log_ID"
      fields={[
        { name: 'Process_Type', label: 'Process', type: 'select', required: true, options: [{ value: 'Melting', label: 'Melting' }, { value: 'Refining', label: 'Refining' }] },
        { name: 'Metal_Type', label: 'Metal Type', required: true, placeholder: 'Gold / Silver' },
        { name: 'Purity_In_Code', label: 'Purity In' },
        { name: 'Purity_Out_Code', label: 'Purity Out' },
        { name: 'Weight_In', label: 'Weight In (g)', type: 'number', step: 0.001, required: true },
        { name: 'Weight_Out', label: 'Weight Out (g)', type: 'number', step: 0.001 },
        { name: 'Log_Date', label: 'Date', type: 'date', required: true, initialValue: dayjs() },
      ]}
      columns={[
        { title: 'Date', dataIndex: 'Log_Date', render: (v) => dayjs(v).format('DD-MMM-YYYY') },
        { title: 'Process', dataIndex: 'Process_Type' },
        { title: 'Metal', dataIndex: 'Metal_Type' },
        { title: 'Wt In', dataIndex: 'Weight_In' },
        { title: 'Wt Out', dataIndex: 'Weight_Out' },
        { title: 'Loss %', dataIndex: 'Loss_Pct' },
      ]}
    />
  );
}

function MouldsTab() {
  const qc = useQueryClient();
  const adjust = async (id, delta) => {
    try { await manufacturingApi.adjustMouldStock(id, delta); qc.invalidateQueries({ queryKey: ['moulds'] }); }
    catch (e) { message.error(e.response?.data?.message || 'Failed.'); }
  };
  return (
    <GenericCrudTab
      queryKey={['moulds']} listFn={manufacturingApi.getMoulds} createFn={manufacturingApi.createMould}
      title="New Mould" rowKey="Mould_ID"
      fields={[
        { name: 'Mould_Name', label: 'Mould Name', required: true },
        { name: 'Rubber_Type', label: 'Rubber Type' },
        { name: 'Stock_Qty', label: 'Initial Stock Qty', type: 'number' },
        { name: 'Standard_Wax_Weight', label: 'Standard Wax Weight (g)', type: 'number', step: 0.001 },
      ]}
      columns={[
        { title: 'Mould', dataIndex: 'Mould_Name' },
        { title: 'Rubber Type', dataIndex: 'Rubber_Type' },
        { title: 'Stock Qty', dataIndex: 'Stock_Qty' },
        {
          title: 'Adjust', render: (_, r) => (
            <Space>
              <Button size="small" onClick={() => adjust(r.Mould_ID, 1)}>+1</Button>
              <Button size="small" onClick={() => adjust(r.Mould_ID, -1)} disabled={r.Stock_Qty <= 0}>-1</Button>
            </Space>
          ),
        },
      ]}
    />
  );
}

export default function ManufacturingPage() {
  const tabsRef = useRef(null);
  const tourSteps = [
    { title: '1. Set Up Departments', description: 'Define your workshop\'s stages — Casting, Filing, Polishing, Setting, etc. — in the order raw gold routes through them.', target: () => tabsRef.current },
    { title: '2. Create a BOM', description: 'A Bill of Materials per design: standard gold weight, expected wastage %, and labour — with a stage-by-department breakdown.' },
    { title: '3. Track Production', description: 'Open a production transaction with the input weight; when the piece comes back, click Complete and enter the actual output weight — wastage % is calculated for you automatically.' },
    { title: '4. Melting/Refining & Moulds', description: 'Log melting/refining batches (loss % computed from weight in vs out) and track rubber mould stock for casting.' },
  ];
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}><Space><BuildOutlined style={{ color: '#B8860B' }} />Manufacturing Efficiency / BOM</Space></Title>
      </div>
      <div ref={tabsRef}>
      <Tabs items={[
        { key: 'departments', label: 'Departments', children: <DepartmentsTab /> },
        { key: 'bom', label: 'BOM', children: <BomTab /> },
        { key: 'production', label: 'Production', children: <ProductionTab /> },
        { key: 'melting', label: 'Melting/Refining', children: <MeltingRefiningTab /> },
        { key: 'moulds', label: 'Moulds', children: <MouldsTab /> },
      ]} />
      </div>
      <PageTour steps={tourSteps} />
    </div>
  );
}
