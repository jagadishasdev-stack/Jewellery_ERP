/**
 * PageTour — drop this on any page with a `steps` array (antd Tour step
 * shape: { title, description, target: () => ref.current }) to get:
 *   1. A floating "?" button (bottom-right) that opens the walkthrough anytime.
 *   2. Auto-start when navigated here from the Help Center with
 *      navigate(path, { state: { startTour: true } }) — see pages/help/HelpCenterPage.jsx.
 *
 * The short delay before auto-opening gives the page's own refs time to
 * attach after mount, so Tour can measure their position correctly.
 */
import React, { useEffect, useState } from 'react';
import { Tour, Button, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

export default function PageTour({ steps }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.startTour) {
      const t = setTimeout(() => setOpen(true), 300);
      navigate(location.pathname + location.search, { replace: true, state: {} });
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Tooltip title="How to use this screen" placement="left">
        <Button
          shape="circle"
          size="large"
          icon={<QuestionCircleOutlined />}
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 24, bottom: 24, zIndex: 1000,
            borderColor: '#B8860B', color: '#B8860B', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        />
      </Tooltip>
      <Tour open={open} onClose={() => setOpen(false)} steps={steps} />
    </>
  );
}
