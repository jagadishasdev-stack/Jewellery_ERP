import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select, Space, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

// Shared list+create tab body for the simpler master/log screens across the
// new modules (Pawnbroking's page hand-writes its own form because its
// pledged-items Form.List and running-balance display are genuinely
// bespoke; most of the other new modules' sub-tabs are a plain "table +
// create form" shape, and duplicating that ~30 times across files was the
// actual thing worth avoiding).
//
// Any dayjs value in the submitted form (from a DatePicker field) is
// converted to a plain 'YYYY-MM-DD' string before hitting the API — every
// new-module route expects a date string, not a moment/dayjs object.
export default function GenericCrudTab({
  queryKey, listFn, createFn, columns, fields, title = 'New', extraButton, rowKey, transformSubmit,
}) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn().then((r) => (Array.isArray(r.data.data) ? r.data.data : r.data.data?.items || [])),
  });

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: () => { message.success('Saved.'); qc.invalidateQueries({ queryKey }); setOpen(false); form.resetFields(); },
    onError: (err) => message.error(err.response?.data?.message || 'Failed to save.'),
  });

  const handleFinish = (values) => {
    const cleaned = { ...values };
    for (const k of Object.keys(cleaned)) {
      if (dayjs.isDayjs(cleaned[k])) cleaned[k] = cleaned[k].format('YYYY-MM-DD');
    }
    createMutation.mutate(transformSubmit ? transformSubmit(cleaned) : cleaned);
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
          {title}
        </Button>
        {extraButton}
      </Space>
      <Table
        size="small" columns={columns} dataSource={data || []} loading={isLoading}
        rowKey={rowKey} pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }}
      />
      <Modal title={title} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleFinish}>
          {fields.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []} initialValue={f.initialValue}>
              {f.type === 'number' ? <InputNumber style={{ width: '100%' }} min={f.min ?? 0} step={f.step || 1} placeholder={f.placeholder} /> :
                f.type === 'date' ? <DatePicker style={{ width: '100%' }} /> :
                f.type === 'select' ? <Select options={f.options} placeholder={f.placeholder} allowClear={f.allowClear} /> :
                f.type === 'textarea' ? <Input.TextArea rows={2} placeholder={f.placeholder} /> :
                <Input placeholder={f.placeholder} />}
            </Form.Item>
          ))}
          <Button type="primary" htmlType="submit" block loading={createMutation.isPending} style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
