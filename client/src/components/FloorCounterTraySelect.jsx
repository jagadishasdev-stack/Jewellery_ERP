import React from 'react';
import { Form, Select, Col } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { floorsApi } from '../api/modules';

const { Option } = Select;

/**
 * Cascading Floor -> Counter -> Tray selects used to assign a real stock
 * location to an ornament (tbl_ornament_master.Floor_ID / Counter_ID / Tray_ID).
 *
 * Must be rendered inside an antd <Form> whose `form` instance is passed in,
 * and inside a <Row> (it renders its own three <Col>s, no wrapping Row).
 *
 * - Floor is populated from floorsApi.getAll().
 * - Counter is populated from floorsApi.getCounters(Floor_ID), enabled only
 *   once a floor is chosen, and refetches whenever the selected floor changes.
 * - Tray is populated from floorsApi.getTrays(Counter_ID), enabled only once
 *   a counter is chosen. Tray is optional — not every counter has trays
 *   (e.g. a Vault-type counter may be used directly).
 *
 * Uses Form.useWatch so that when a parent pre-fills the form via
 * form.setFieldsValue({ Floor_ID, Counter_ID, Tray_ID, ... }) (e.g. opening
 * an edit modal for an existing ornament), the dependent Counter/Tray
 * queries fire automatically and the selects come up populated — no manual
 * pre-fetch needed before setFieldsValue.
 */
export default function FloorCounterTraySelect({ form, colSpan = 8 }) {
  const floorId = Form.useWatch('Floor_ID', form);
  const counterId = Form.useWatch('Counter_ID', form);

  const { data: floors } = useQuery({
    queryKey: ['floors'],
    queryFn: () => floorsApi.getAll().then((r) => r.data.data),
  });

  const { data: counters, isFetching: countersLoading } = useQuery({
    queryKey: ['floor-counters', floorId],
    queryFn: () => floorsApi.getCounters(floorId).then((r) => r.data.data),
    enabled: !!floorId,
  });

  const { data: trays, isFetching: traysLoading } = useQuery({
    queryKey: ['counter-trays', counterId],
    queryFn: () => floorsApi.getTrays(counterId).then((r) => r.data.data),
    enabled: !!counterId,
  });

  return (
    <>
      <Col xs={24} md={colSpan}>
        <Form.Item name="Floor_ID" label="Floor">
          <Select
            allowClear
            showSearch
            optionFilterProp="children"
            placeholder="Select floor"
            onChange={() => form.setFieldsValue({ Counter_ID: undefined, Tray_ID: undefined })}
          >
            {(floors || []).map((f) => (
              <Option key={f.Floor_ID} value={f.Floor_ID}>{f.Floor_Name}</Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} md={colSpan}>
        <Form.Item name="Counter_ID" label="Counter">
          <Select
            allowClear
            showSearch
            optionFilterProp="children"
            disabled={!floorId}
            loading={countersLoading}
            placeholder={floorId ? 'Select counter' : 'Select a floor first'}
            onChange={() => form.setFieldsValue({ Tray_ID: undefined })}
          >
            {(counters || []).map((c) => (
              <Option key={c.Counter_ID} value={c.Counter_ID}>{c.Counter_Name}</Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col xs={24} md={colSpan}>
        <Form.Item name="Tray_ID" label="Tray (optional)">
          <Select
            allowClear
            showSearch
            optionFilterProp="children"
            disabled={!counterId}
            loading={traysLoading}
            placeholder={counterId ? 'Select tray (optional)' : 'Select a counter first'}
          >
            {(trays || []).map((t) => (
              <Option key={t.Tray_ID} value={t.Tray_ID}>{t.Tray_Name}</Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
    </>
  );
}
