import React, { useState, useEffect, useRef } from 'react';
import {
  Form, Input, InputNumber, Select, Button, Card, Row, Col,
  Divider, Typography, Space, message, Alert,
} from 'antd';
import { SaveOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ornamentsApi, masterApi, karigarApi } from '../../api/modules';
import { calculateOrnamentPrice, formatCurrency } from '../../utils/calculations';
import { useGoldRate } from '../../hooks/useGoldRate';
import FloorCounterTraySelect from '../../components/FloorCounterTraySelect';
import PageTour from '../../components/PageTour';
import { useMetalTypes } from '../../hooks/useMetalTypes';
import { useActionShortcuts } from '../../hooks/useActionShortcuts';
import { useF2Lookup } from '../../hooks/useF2Lookup';

const { Title, Text } = Typography;
const { Option } = Select;

export default function AddOrnamentPage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [priceCalc, setPriceCalc] = useState(null);
  const { goldRate } = useGoldRate();

  // ── Walkthrough tour refs ───────────────────────────────────────────────────
  const classificationRef = useRef(null);
  const weightRef = useRef(null);
  const pricingRef = useRef(null);
  const calcRef = useRef(null);
  const saveRef = useRef(null);
  const tourSteps = [
    { title: '1. Classification', description: 'Choose the item type, design and purity — plus the article number/barcode (auto-generated if left blank), hallmark certificate number, and where it will be physically stored.', target: () => classificationRef.current },
    { title: '2. Weight Details', description: 'Enter gross weight, net gold weight, stone weight and the wastage % you charge — plus stone type/count if this piece has stones set in it.', target: () => weightRef.current },
    { title: '3. Pricing', description: 'Set the gold rate, making charge per gram, any discount %, and the purchase cost you paid — these feed the price calculator on the right.', target: () => pricingRef.current },
    { title: '4. Price Calculator', description: 'Updates live as you fill in weight and pricing — shows gold value, making charges, wastage, GST and the final MRP the customer will pay.', target: () => calcRef.current },
    { title: '5. Save Ornament', description: 'Once everything looks correct, click here to add this piece to your stock — it will then be searchable and sellable from POS.', target: () => saveRef.current },
  ];

  const { data: itemTypes } = useQuery({ queryKey: ['item-types'], queryFn: () => masterApi.getItemTypes().then((r) => r.data.data) });
  const { data: designs } = useQuery({ queryKey: ['designs'], queryFn: () => masterApi.getDesigns().then((r) => r.data.data) });
  const { data: purities } = useQuery({ queryKey: ['purities'], queryFn: () => masterApi.getPurities().then((r) => r.data.data) });
  const { data: gemstones } = useQuery({ queryKey: ['gemstones'], queryFn: () => masterApi.getGemstones().then((r) => r.data.data) });
  const { data: vendors } = useQuery({ queryKey: ['vendors-all'], queryFn: () => karigarApi.getVendors().then((r) => r.data.data) });
  const { metalTypes, metalTypesWithPurity } = useMetalTypes();

  // Which metal type is selected drives the Purity dropdown (a Platinum
  // item shouldn't offer 22K gold purities) and whether Purity/gold rate
  // are required at all — a loose parcel-type metal (Diamond, or any
  // custom metal type an admin marks Has_Purity=false) has neither.
  // Previously hardcoded to `metalType === 'Diamond'` specifically, which
  // silently didn't apply to any custom no-purity metal type an admin adds.
  const metalType = Form.useWatch('Metal_Type', form);
  // metalTypesWithPurity.length check avoids a false-positive "isDiamond"
  // flash for every metal type during the brief window before the live
  // list has loaded.
  const isDiamond = !!metalType && metalTypesWithPurity.length > 0 && !metalTypesWithPurity.includes(metalType);
  const filteredPurities = (purities || []).filter((p) => !metalType || p.Metal_Type === metalType);

  // Which Item Type is selected drives the Design dropdown — a Ring
  // shouldn't offer Necklace designs. tbl_design_master.Type_ID has always
  // existed for this; it just wasn't wired up to filter anything before.
  const typeId = Form.useWatch('Type_ID', form);
  const filteredDesigns = (designs || []).filter((d) => !typeId || d.Type_ID === typeId);

  // F2 opens the full option list for each of these — same as clicking them.
  const itemTypeLookup = useF2Lookup();
  const designLookup = useF2Lookup();
  const purityLookup = useF2Lookup();
  const metalTypeLookup = useF2Lookup();

  const recalculate = () => {
    const v = form.getFieldsValue();
    if (!v.Net_Gold_Weight || !v.Current_Gold_Rate || !v.Base_Making_Charge_Per_Gram) return;
    const result = calculateOrnamentPrice({
      netGoldWeight: v.Net_Gold_Weight,
      goldRate: v.Current_Gold_Rate,
      makingChargePerGram: v.Base_Making_Charge_Per_Gram,
      wastagePercent: v.Wastage_Percentage || 3,
      discountPercent: v.Discount_Percentage || 0,
      gstPercent: 3,
    });
    setPriceCalc(result);
  };

  // Prefill for edit — form.setFieldsValue() is a PROGRAMMATIC update, which
  // Ant Design deliberately does not route through onValuesChange (that only
  // fires on real user input). Without the explicit recalculate() call here,
  // the Price Calculator panel would keep showing its "fill in the fields"
  // placeholder even though every field is actually populated from the
  // fetched ornament, until the user happened to touch a field by hand.
  useEffect(() => {
    if (editId) {
      ornamentsApi.getById(editId).then((r) => {
        form.setFieldsValue(r.data.data);
        recalculate();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Auto-fill gold rate — same programmatic-update gotcha as above: if the
  // live gold rate loads AFTER the user has already typed weight and making
  // charge, this field's value updates on screen but the calculator never
  // re-runs to notice, since setFieldValue() doesn't trigger onValuesChange
  // either. The explicit recalculate() call is what makes the calculator
  // actually reflect the auto-filled rate instead of silently going stale.
  useEffect(() => {
    if (!editId) {
      form.setFieldValue('Current_Gold_Rate', goldRate);
      recalculate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goldRate]);

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? ornamentsApi.update(editId, data) : ornamentsApi.create(data),
    onSuccess: () => {
      message.success(editId ? 'Ornament updated!' : 'Ornament added to inventory!');
      navigate('/inventory');
    },
    onError: (err) => message.error(err.response?.data?.message || 'Save failed.'),
  });

  const onFinish = (values) => {
    const data = {
      ...values,
      Final_Making_Charge_Total: priceCalc?.makingChargeTotal,
      Wastage_Amount: priceCalc?.wastageAmount,
      Wastage_Weight: priceCalc?.wastageWeight,
      Taxable_Value: priceCalc?.taxableValue,
      GST_Amount: priceCalc?.gstAmount,
      Total_Price: priceCalc?.totalPrice,
      Discount_Amount: priceCalc?.discountAmount,
    };
    saveMutation.mutate(data);
  };

  useActionShortcuts({
    onSave: () => form.submit(),
    onCancel: () => navigate('/inventory'),
  });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>{editId ? 'Edit Ornament' : 'Add New Ornament'}</Title>
        <Space>
          <Button onClick={() => navigate('/inventory')}>Cancel</Button>
          <Button ref={saveRef} type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending}
            onClick={() => form.submit()}
            style={{ background: '#B8860B', borderColor: '#B8860B' }}>
            Save Ornament
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={recalculate}>
        <Row gutter={[16, 0]}>
          {/* Classification */}
          <Col xs={24} lg={16}>
            <div ref={classificationRef}>
            <Card title="Classification" style={{ borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="Metal_Type" label="Metal Type (F2 to browse)" rules={[{ required: true, message: 'Select the metal type' }]} initialValue="Gold">
                    <Select
                      placeholder="Select metal"
                      open={metalTypeLookup.open} onDropdownVisibleChange={metalTypeLookup.onOpenChange} onKeyDown={metalTypeLookup.onKeyDown}
                      onChange={() => form.setFieldValue('Purity_ID', undefined)}
                    >
                      {metalTypes.map((m) => <Option key={m} value={m}>{m}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Type_ID" label="Item Type (F2 to browse)" rules={[{ required: true }]}>
                    <Select placeholder="Select type" showSearch optionFilterProp="children"
                      open={itemTypeLookup.open} onDropdownVisibleChange={itemTypeLookup.onOpenChange} onKeyDown={itemTypeLookup.onKeyDown}
                      onChange={() => form.setFieldValue('Design_ID', undefined)}>
                      {(itemTypes || []).map((t) => <Option key={t.Type_ID} value={t.Type_ID}>{t.Type_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Design_ID" label="Design (F2 to browse)">
                    <Select placeholder={typeId ? 'Select design' : 'Select item type first'} allowClear showSearch optionFilterProp="children"
                      open={designLookup.open} onDropdownVisibleChange={designLookup.onOpenChange} onKeyDown={designLookup.onKeyDown}>
                      {filteredDesigns.map((d) => <Option key={d.Design_ID} value={d.Design_ID}>{d.Design_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  {/* Purity (karat/fineness) has no meaning for a Diamond
                      parcel — hidden rather than shown-disabled so it's
                      not mistaken for a field that still needs filling in. */}
                  {!isDiamond && (
                    <Form.Item name="Purity_ID" label="Purity (F2 to browse)" rules={[{ required: true }]}>
                      <Select placeholder={metalType ? `Select ${metalType.toLowerCase()} purity` : 'Select metal type first'}
                        open={purityLookup.open} onDropdownVisibleChange={purityLookup.onOpenChange} onKeyDown={purityLookup.onKeyDown}>
                        {filteredPurities.map((p) => <Option key={p.Purity_ID} value={p.Purity_ID}>{p.Purity_Code} ({p.Percentage}%)</Option>)}
                      </Select>
                    </Form.Item>
                  )}
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Article_Number" label="Article Number / Barcode">
                    <Input placeholder="Auto-generated if empty" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Hallmark_Certificate_No" label="Hallmark Certificate No">
                    <Input placeholder="BIS certificate number" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="Physical_Location" label="Location Note (optional)">
                    <Input placeholder="e.g. R-A-03" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <FloorCounterTraySelect form={form} colSpan={8} />
              </Row>
            </Card>
            </div>

            {/* Weight */}
            <div ref={weightRef}>
            <Card title="Weight Details (in grams)" style={{ borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item name="Gross_Weight" label="Gross Weight" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} step={0.001} min={0.001} placeholder="25.500" />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  {/* A Diamond parcel has no gold content — 0 is a real,
                      valid value for it, not a missing field. */}
                  <Form.Item name="Net_Gold_Weight" label="Net Gold Weight" initialValue={isDiamond ? 0 : undefined} rules={[{ required: !isDiamond }]}>
                    <InputNumber style={{ width: '100%' }} step={0.001} min={0} placeholder={isDiamond ? '0 (no gold content)' : '24.100'} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Stone_Weight" label="Stone Weight" initialValue={0}>
                    <InputNumber style={{ width: '100%' }} step={0.001} min={0} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Wastage_Percentage" label="Wastage %" initialValue={3}>
                    <InputNumber style={{ width: '100%' }} step={0.5} min={0} max={20} />
                  </Form.Item>
                </Col>
              </Row>

              {/* Stone details */}
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item name="Stone_ID" label="Stone Type">
                    <Select allowClear placeholder="Select stone">
                      {(gemstones || []).map((g) => <Option key={g.Stone_ID} value={g.Stone_ID}>{g.Stone_Name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Number_Of_Stones" label="No. of Stones" initialValue={0}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
            </div>

            {/* Pricing */}
            <div ref={pricingRef}>
            <Card title="Pricing" style={{ borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item name="Current_Gold_Rate" label="Gold Rate (₹/g)" initialValue={isDiamond ? 0 : undefined} rules={[{ required: !isDiamond }]}>
                    <InputNumber style={{ width: '100%' }} min={0} formatter={(v) => `₹ ${v}`} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Base_Making_Charge_Per_Gram" label="Making Charge (₹/g)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Discount_Percentage" label="Discount %" initialValue={0}>
                    <InputNumber style={{ width: '100%' }} min={0} max={100} step={0.5} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="Purchase_Cost" label="Purchase Cost (₹)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} formatter={(v) => `₹ ${v}`} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
            </div>

            {/* Supplier / Karigar */}
            <Card title="Supplier & Karigar" style={{ borderRadius: 8 }}>
              <Row gutter={16}>
                <Col xs={12}>
                  <Form.Item name="Supplier_ID" label="Supplier">
                    <Select allowClear placeholder="Select supplier" showSearch optionFilterProp="children">
                      {(vendors || []).filter((v) => ['Supplier', 'Both'].includes(v.Vendor_Type)).map((v) => (
                        <Option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Vendor_Name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="Karigar_ID" label="Karigar">
                    <Select allowClear placeholder="Select karigar" showSearch optionFilterProp="children">
                      {(vendors || []).filter((v) => ['Karigar', 'Both'].includes(v.Vendor_Type)).map((v) => (
                        <Option key={v.Vendor_ID} value={v.Vendor_ID}>{v.Vendor_Name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="Special_Instructions" label="Special Instructions">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Card>
          </Col>

          {/* Price Calculator */}
          <Col xs={24} lg={8}>
            <div ref={calcRef}>
            <Card
              title={<Space><CalculatorOutlined style={{ color: '#B8860B' }} />Price Calculator</Space>}
              style={{ borderRadius: 8, position: 'sticky', top: 80 }}
            >
              {priceCalc ? (
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  {[
                    { label: 'Gold Value', value: priceCalc.goldValue },
                    { label: 'Making Charge', value: priceCalc.makingChargeTotal },
                    { label: 'Wastage Amount', value: priceCalc.wastageAmount },
                    { label: 'Discount', value: `-${priceCalc.discountAmount}`, danger: true },
                  ].map((r) => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary">{r.label}</Text>
                      <Text type={r.danger ? 'danger' : undefined}>{formatCurrency(r.value.replace('-', ''))}</Text>
                    </div>
                  ))}
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Taxable Value</Text>
                    <Text strong>{formatCurrency(priceCalc.taxableValue)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>GST (3%)</Text>
                    <Text>{formatCurrency(priceCalc.gstAmount)}</Text>
                  </div>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 15 }}>Total Price (MRP)</Text>
                    <Text strong style={{ fontSize: 17, color: '#B8860B' }}>
                      {formatCurrency(priceCalc.totalPrice)}
                    </Text>
                  </div>
                </Space>
              ) : (
                <Alert message="Fill in weight, gold rate & making charge to see price calculation." type="info" showIcon style={{ borderRadius: 6 }} />
              )}
            </Card>
            </div>
          </Col>
        </Row>
      </Form>

      <PageTour steps={tourSteps} />
    </div>
  );
}
