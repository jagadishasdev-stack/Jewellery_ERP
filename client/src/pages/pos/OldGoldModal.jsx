import React, { useState } from 'react';
import { Modal, Form, InputNumber, Select, Typography, Divider, Button } from 'antd';
import { calculateOldGoldExchange, formatCurrency } from '../../utils/calculations';

const { Text } = Typography;
const { Option } = Select;

export default function OldGoldModal({ open, goldRate, onClose, onConfirm }) {
  const [form] = Form.useForm();
  const [calc, setCalc] = useState(null);

  const recalculate = () => {
    const values = form.getFieldsValue();
    if (!values.weight || !values.purityPercent) return;
    const result = calculateOldGoldExchange({
      weight: values.weight,
      purityPercent: values.purityPercent,
      goldRate,
      meltingDeductPercent: values.meltingDeduct || 2,
    });
    setCalc(result);
  };

  const handleConfirm = () => {
    if (!calc) return;
    onConfirm(form.getFieldValue('weight'), calc.value);
  };

  const purities = [
    { label: '24K (99.9%)', value: 99.9 },
    { label: '22K (91.67%)', value: 91.67 },
    { label: '18K (75%)', value: 75 },
    { label: '14K (58.33%)', value: 58.33 },
    { label: 'Old Mixed', value: 70 },
  ];

  return (
    <Modal
      title="Old Gold Exchange"
      open={open}
      onCancel={() => { setCalc(null); onClose(); }}
      footer={null}
      width={420}
    >
      <Form form={form} layout="vertical" onValuesChange={recalculate}>
        <Form.Item name="weight" label="Old Gold Weight (grams)" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} min={0.001} step={0.001} placeholder="25.500" />
        </Form.Item>
        <Form.Item name="purityPercent" label="Purity" rules={[{ required: true }]}>
          <Select placeholder="Select purity">
            {purities.map((p) => (
              <Option key={p.value} value={p.value}>{p.label}</Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="meltingDeduct" label="Melting Deduction (%)" initialValue={2}>
          <InputNumber style={{ width: '100%' }} min={0} max={10} step={0.5} />
        </Form.Item>
      </Form>

      {calc && (
        <>
          <Divider />
          <div style={{ background: '#f9f9f9', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Pure Gold Weight</Text>
              <Text>{calc.pureGoldWeight}g</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Melting Deduction</Text>
              <Text type="danger">- {calc.meltingDeductWeight}g</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Net Weight</Text>
              <Text strong>{calc.netWeight}g</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Gold Rate</Text>
              <Text>{formatCurrency(goldRate)}/g</Text>
            </div>
            <Divider style={{ margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 15 }}>Exchange Value</Text>
              <Text strong style={{ fontSize: 16, color: '#B8860B' }}>{formatCurrency(calc.value)}</Text>
            </div>
          </div>
          <Button
            type="primary" block style={{ marginTop: 16, background: '#B8860B', borderColor: '#B8860B' }}
            onClick={handleConfirm}
          >
            Apply Exchange
          </Button>
        </>
      )}
    </Modal>
  );
}
