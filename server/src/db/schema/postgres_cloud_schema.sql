-- ============================================================================
-- Jewellery ERP — Cloud (PostgreSQL) schema
-- ============================================================================
-- Multi-tenant, database-per-tenant design. Generated via `pg_dump
-- --schema-only` against the live dev database after applying every Knex
-- migration in server/src/db/migrations/ (this is generated output, not
-- hand-written — regenerate it the same way after adding new migrations,
-- don't hand-edit it directly).
--
-- 142 tables total (added tbl_chart_of_accounts — the real double-entry
-- Chart of Accounts behind tbl_accounting_journal/tbl_accounting_entries,
-- which existed before but posted against bare free-text ledger-name
-- strings with no real account or balance check behind them):
--   - SA_MASTER control-plane (tbl_tenant_master, tbl_license_master,
--     tbl_erp_modules, tbl_device_master, tbl_app_version_master,
--     tbl_subscription_plan_master, tbl_tenant_subscription,
--     tbl_system_setting, ...) — the platform operator's own data, not any
--     tenant's business data.
--   - Per-tenant business tables (sales, purchase, ornament/stock, karigar,
--     savings schemes, pawnbroking, insurance/AMC, HR/payroll, CRM,
--     banking, rate booking, HSN/e-invoice/loyalty, manufacturing/BOM,
--     guarantor/certification, Tally bridge, user permission overrides,
--     tbl_sync_queue/tbl_sync_log, ...) — every one of these carries a
--     Tenant_ID column *and* a Sync_UUID column (globally-unique, generated
--     client-side, independent of the integer PK) so a record created
--     offline on any device can be safely deduplicated once it reaches the
--     cloud — see SYNC_ARCHITECTURE_NOTES.md for why the PK itself wasn't
--     replaced with a UUID.
--
-- See mysql_local_schema.sql for the single-tenant MySQL equivalent used by
-- the offline/desktop install, LEGACY_DATA_MIGRATION_NOTES.md for how the
-- old desktop ERP's tables map onto this one, and SYNC_ARCHITECTURE_NOTES.md
-- for the local↔cloud sync design.
-- ============================================================================

--
-- PostgreSQL database dump
--

\restrict ra0C3URMFi4JqIs4HU4oltYEwo1SfkQeuGd8wM4v3cFbRfh3irDW3l9GJgK5CeR

-- Dumped from database version 15.18 (Homebrew)
-- Dumped by pg_dump version 15.18 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
--



--
--

--



--
--



--
--

--



--
-- Name: tbl_accounting_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_accounting_entries (
    "Entry_ID" integer NOT NULL,
    "Journal_ID" integer,
    "Tenant_ID" character varying(50) NOT NULL,
    "Ledger_Account" character varying(100) NOT NULL,
    "Account_Type" character varying(30),
    "Entry_Type" character varying(10) NOT NULL,
    "Amount" numeric(15,2) NOT NULL,
    "Narration" character varying(300),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Entry_Date" date,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL,
    "Account_ID" integer
);


--
-- Name: COLUMN tbl_accounting_entries."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_accounting_entries."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_accounting_entries_Entry_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_accounting_entries_Entry_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_accounting_entries_Entry_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_accounting_entries_Entry_ID_seq" OWNED BY public.tbl_accounting_entries."Entry_ID";


--
-- Name: tbl_accounting_journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_accounting_journal (
    "Journal_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Journal_Number" character varying(60),
    "Entry_Date" date NOT NULL,
    "Source_Type" character varying(30) NOT NULL,
    "Source_ID" integer,
    "Reference" character varying(100),
    "Narration" text,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_accounting_journal."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_accounting_journal."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_accounting_journal_Journal_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_accounting_journal_Journal_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_accounting_journal_Journal_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_accounting_journal_Journal_ID_seq" OWNED BY public.tbl_accounting_journal."Journal_ID";


--
-- Name: tbl_agent_commission_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_agent_commission_transactions (
    "Txn_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Agent_ID" integer NOT NULL,
    "Source_Type" character varying(20) NOT NULL,
    "Source_ID" bigint NOT NULL,
    "Commission_Base_Amount" numeric(15,2) NOT NULL,
    "Commission_Pct_Applied" numeric(5,2) NOT NULL,
    "Commission_Amount" numeric(10,2) NOT NULL,
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Paid_Date" date,
    "Payment_Reference" character varying(50),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_agent_commission_transactions_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_agent_commission_transactions_Txn_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_agent_commission_transactions_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_agent_commission_transactions_Txn_ID_seq" OWNED BY public.tbl_agent_commission_transactions."Txn_ID";


--
-- Name: tbl_agent_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_agent_master (
    "Agent_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Branch_ID" character varying(50),
    "Agent_Code" character varying(30) NOT NULL,
    "Agent_Name" character varying(100) NOT NULL,
    "Mobile" character varying(20) NOT NULL,
    "Email" character varying(100),
    "Address" character varying(300),
    "Status" character varying(10) DEFAULT 'Active'::character varying,
    "Commission_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_agent_master_Agent_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_agent_master_Agent_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_agent_master_Agent_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_agent_master_Agent_ID_seq" OWNED BY public.tbl_agent_master."Agent_ID";


--
-- Name: tbl_amc_enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_amc_enrollment (
    "Enrollment_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_ID" integer,
    "Plan_ID" integer,
    "Ornament_ID" bigint,
    "Sale_ID" bigint,
    "Start_Date" date NOT NULL,
    "Expiry_Date" date NOT NULL,
    "Amount_Paid" numeric(10,2) NOT NULL,
    "Last_Service_Date" date,
    "Services_Used" integer DEFAULT 0,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_amc_enrollment_Enrollment_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_amc_enrollment_Enrollment_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_amc_enrollment_Enrollment_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_amc_enrollment_Enrollment_ID_seq" OWNED BY public.tbl_amc_enrollment."Enrollment_ID";


--
-- Name: tbl_amc_plan_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_amc_plan_master (
    "Plan_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Plan_Name" character varying(100) NOT NULL,
    "Duration_Months" integer DEFAULT 12 NOT NULL,
    "Amount" numeric(10,2) NOT NULL,
    "Free_Services_Included" integer DEFAULT 1,
    "Coverage_Details" text,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_amc_plan_master_Plan_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_amc_plan_master_Plan_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_amc_plan_master_Plan_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_amc_plan_master_Plan_ID_seq" OWNED BY public.tbl_amc_plan_master."Plan_ID";


--
-- Name: tbl_app_version_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_app_version_master (
    "Version_ID" integer NOT NULL,
    "Platform" character varying(20) NOT NULL,
    "Version_Number" character varying(20) NOT NULL,
    "Is_Mandatory" boolean DEFAULT false,
    "Min_Supported_Version" character varying(20),
    "Release_Notes" text,
    "Download_URL" character varying(500),
    "Released_Date" date NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_app_version_master_Version_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_app_version_master_Version_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_app_version_master_Version_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_app_version_master_Version_ID_seq" OWNED BY public.tbl_app_version_master."Version_ID";


--
-- Name: tbl_approval_issue_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_approval_issue_header (
    "Issue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Voucher_Number" character varying(40) NOT NULL,
    "Party_ID" bigint,
    "Issue_Date" date NOT NULL,
    "Expected_Return_Date" date,
    "Total_Items_Issued" integer DEFAULT 0 NOT NULL,
    "Total_Weight_Issued" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Value_Issued" numeric(15,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_By" character varying(50),
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Cancelled_By" character varying(50),
    "Cancelled_Date" timestamp with time zone,
    "Cancellation_Reason" text,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_approval_issue_header_Issue_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_approval_issue_header_Issue_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_approval_issue_header_Issue_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_approval_issue_header_Issue_ID_seq" OWNED BY public.tbl_approval_issue_header."Issue_ID";


--
-- Name: tbl_approval_issue_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_approval_issue_items (
    "Issue_Item_ID" bigint NOT NULL,
    "Issue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Ornament_ID" bigint,
    "Article_Number" character varying(50),
    "Gross_Weight" numeric(10,3),
    "Net_Gold_Weight" numeric(10,3),
    "Purity_Code" character varying(20),
    "Approx_Value" numeric(15,2),
    "Item_Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Received_In_Receive_ID" bigint,
    "Received_Date" timestamp with time zone,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_approval_issue_items_Issue_Item_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_approval_issue_items_Issue_Item_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_approval_issue_items_Issue_Item_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_approval_issue_items_Issue_Item_ID_seq" OWNED BY public.tbl_approval_issue_items."Issue_Item_ID";


--
-- Name: tbl_approval_party_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_approval_party_master (
    "Party_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Party_Name" character varying(150) NOT NULL,
    "Shop_Name" character varying(150),
    "Contact_Person" character varying(100),
    "Mobile" character varying(15),
    "Alt_Mobile" character varying(15),
    "GST_Number" character varying(20),
    "Address" text,
    "City" character varying(100),
    "Remarks" text,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_By" character varying(50),
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_approval_party_master_Party_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_approval_party_master_Party_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_approval_party_master_Party_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_approval_party_master_Party_ID_seq" OWNED BY public.tbl_approval_party_master."Party_ID";


--
-- Name: tbl_approval_receive_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_approval_receive_header (
    "Receive_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Voucher_Number" character varying(40) NOT NULL,
    "Issue_ID" bigint NOT NULL,
    "Receive_Date" date NOT NULL,
    "Items_Received_Count" integer DEFAULT 0 NOT NULL,
    "Total_Weight_Received" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Value_Received" numeric(15,2) DEFAULT '0'::numeric,
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_approval_receive_header_Receive_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_approval_receive_header_Receive_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_approval_receive_header_Receive_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_approval_receive_header_Receive_ID_seq" OWNED BY public.tbl_approval_receive_header."Receive_ID";


--
-- Name: tbl_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_attendance (
    "Attendance_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "User_ID" integer NOT NULL,
    "Attendance_Date" date NOT NULL,
    "Check_In" time without time zone,
    "Check_Out" time without time zone,
    "Status" character varying(20) DEFAULT 'Present'::character varying NOT NULL,
    "Source" character varying(20) DEFAULT 'Manual'::character varying,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_attendance_Attendance_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_attendance_Attendance_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_attendance_Attendance_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_attendance_Attendance_ID_seq" OWNED BY public.tbl_attendance."Attendance_ID";


--
-- Name: tbl_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_audit_log (
    "Log_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20),
    "User_ID" integer,
    "Table_Name" character varying(50),
    "Record_ID" character varying(50),
    "Action_Type" character varying(20),
    "Old_Data" jsonb,
    "New_Data" jsonb,
    "IP_Address" character varying(50),
    "Browser_Info" character varying(200),
    "Action_Timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Username" character varying(100),
    "Full_Name" character varying(200),
    "Branch_ID" character varying(50),
    "Description" text,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_audit_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_audit_log_Log_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_audit_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_audit_log_Log_ID_seq" OWNED BY public.tbl_audit_log."Log_ID";


--
-- Name: tbl_bank_account_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bank_account_master (
    "Account_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Bank_Name" character varying(100) NOT NULL,
    "Account_Name" character varying(100),
    "Account_Number" character varying(30) NOT NULL,
    "IFSC_Code" character varying(20),
    "Account_Type" character varying(20) DEFAULT 'Current'::character varying,
    "Opening_Balance" numeric(15,2) DEFAULT '0'::numeric,
    "Current_Balance" numeric(15,2) DEFAULT '0'::numeric,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bank_account_master_Account_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bank_account_master_Account_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bank_account_master_Account_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bank_account_master_Account_ID_seq" OWNED BY public.tbl_bank_account_master."Account_ID";


--
-- Name: tbl_bin_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bin_orders (
    "Order_ID" integer NOT NULL,
    "Voucher_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Branch_ID" character varying(50),
    "Order_Date" date NOT NULL,
    "Order_Type" character varying(20) DEFAULT 'Customer'::character varying,
    "Party_Name" character varying(100) NOT NULL,
    "Party_Mobile" character varying(20),
    "Party_ID" integer,
    "Item_Description" text,
    "Design_Details" character varying(200),
    "Purity" character varying(20),
    "Estimated_Weight" numeric(10,3),
    "Actual_Weight" numeric(10,3),
    "Due_Date" date,
    "Estimated_Amount" numeric(14,2) DEFAULT '0'::numeric,
    "Advance_Amount" numeric(14,2) DEFAULT '0'::numeric,
    "Payment_Mode" character varying(30),
    "Assigned_Karigar_ID" integer,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Remarks" text,
    "Ornament_ID" integer,
    "Data_Mode" smallint DEFAULT '3'::smallint,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bin_orders_Order_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bin_orders_Order_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bin_orders_Order_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bin_orders_Order_ID_seq" OWNED BY public.tbl_bin_orders."Order_ID";


--
-- Name: tbl_bin_purchase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bin_purchase (
    "Bin_ID" integer NOT NULL,
    "Voucher_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Branch_ID" character varying(50),
    "Purchase_Date" date NOT NULL,
    "Source_Type" character varying(20) DEFAULT 'Supplier'::character varying,
    "Supplier_ID" integer,
    "Supplier_Name" character varying(100) NOT NULL,
    "Supplier_Mobile" character varying(20),
    "Item_Category" character varying(100),
    "Design_Name" character varying(100),
    "Purity" character varying(20),
    "Gross_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Net_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Stone_Details" text,
    "Purchase_Rate" numeric(12,2) DEFAULT '0'::numeric,
    "Purchase_Amount" numeric(14,2) DEFAULT '0'::numeric,
    "Making_Charge" numeric(12,2) DEFAULT '0'::numeric,
    "Invoice_Number" character varying(50),
    "Remarks" text,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Inspected_By" character varying(100),
    "Inspected_At" timestamp with time zone,
    "Approved_By" character varying(100),
    "Approved_At" timestamp with time zone,
    "Ornament_ID" integer,
    "Article_Number" character varying(50),
    "Data_Mode" smallint DEFAULT '3'::smallint,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bin_purchase_Bin_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bin_purchase_Bin_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bin_purchase_Bin_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bin_purchase_Bin_ID_seq" OWNED BY public.tbl_bin_purchase."Bin_ID";


--
-- Name: tbl_bin_pure_gold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bin_pure_gold (
    "Gold_ID" integer NOT NULL,
    "Voucher_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Branch_ID" character varying(50),
    "Purchase_Date" date NOT NULL,
    "Supplier_ID" integer,
    "Supplier_Name" character varying(100) NOT NULL,
    "Gold_Type" character varying(30) DEFAULT 'Bar'::character varying,
    "Piece_Number" character varying(50),
    "Purity" character varying(10) DEFAULT '24K'::character varying,
    "Gross_Weight" numeric(10,3) NOT NULL,
    "Net_Weight" numeric(10,3) NOT NULL,
    "Purchase_Rate" numeric(12,2) DEFAULT '0'::numeric,
    "Purchase_Amount" numeric(14,2) DEFAULT '0'::numeric,
    "Storage_Location" character varying(100),
    "Remarks" text,
    "Status" character varying(20) DEFAULT 'Holding'::character varying,
    "Disposed_By" character varying(30),
    "Disposed_At" timestamp with time zone,
    "Data_Mode" smallint DEFAULT '3'::smallint,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bin_pure_gold_Gold_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bin_pure_gold_Gold_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bin_pure_gold_Gold_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bin_pure_gold_Gold_ID_seq" OWNED BY public.tbl_bin_pure_gold."Gold_ID";


--
-- Name: tbl_bin_sales_return; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bin_sales_return (
    "Return_ID" integer NOT NULL,
    "Voucher_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Branch_ID" character varying(50),
    "Return_Date" date NOT NULL,
    "Original_Invoice_Number" character varying(50),
    "Original_Sale_ID" integer,
    "Customer_Name" character varying(100) NOT NULL,
    "Customer_Mobile" character varying(20),
    "Customer_ID" integer,
    "Item_Description" character varying(200),
    "Item_Category" character varying(100),
    "Purity" character varying(20),
    "Gross_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Net_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Return_Reason" character varying(50) DEFAULT 'Design'::character varying,
    "Return_Notes" text,
    "Inspection_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Inspected_By" character varying(100),
    "Inspected_At" timestamp with time zone,
    "Refund_Mode" character varying(30),
    "Refund_Amount" numeric(14,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Received'::character varying,
    "New_Ornament_ID" integer,
    "New_Article_Number" character varying(50),
    "Data_Mode" smallint DEFAULT '3'::smallint,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bin_sales_return_Return_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bin_sales_return_Return_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bin_sales_return_Return_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bin_sales_return_Return_ID_seq" OWNED BY public.tbl_bin_sales_return."Return_ID";


--
-- Name: tbl_bom_department_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bom_department_stages (
    "Stage_ID" bigint NOT NULL,
    "BOM_ID" integer NOT NULL,
    "Dept_ID" integer NOT NULL,
    "Sequence_No" integer DEFAULT 1 NOT NULL,
    "Standard_Wastage_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Standard_Labour_Rate" numeric(10,2),
    "Standard_Time_Minutes" integer
);


--
-- Name: tbl_bom_department_stages_Stage_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bom_department_stages_Stage_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bom_department_stages_Stage_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bom_department_stages_Stage_ID_seq" OWNED BY public.tbl_bom_department_stages."Stage_ID";


--
-- Name: tbl_bom_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_bom_master (
    "BOM_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Design_ID" integer,
    "Type_ID" integer,
    "BOM_Name" character varying(100) NOT NULL,
    "Version" integer DEFAULT 1,
    "Standard_Gold_Weight" numeric(10,3),
    "Standard_Stone_Weight" numeric(10,3),
    "Standard_Wastage_Pct" numeric(5,2) DEFAULT '3'::numeric,
    "Standard_Labour_Amount" numeric(10,2),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_bom_master_BOM_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_bom_master_BOM_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_bom_master_BOM_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_bom_master_BOM_ID_seq" OWNED BY public.tbl_bom_master."BOM_ID";


--
-- Name: tbl_branch_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_branch_master (
    "Branch_ID" character varying(20) NOT NULL,
    "Tenant_ID" character varying(20),
    "Branch_Name" character varying(100) NOT NULL,
    "Branch_Code" character varying(10) NOT NULL,
    "Address_Line1" character varying(200),
    "Address_Line2" character varying(200),
    "City" character varying(50),
    "State" character varying(50),
    "Pincode" character varying(10),
    "Phone" character varying(20),
    "Email" character varying(100),
    "GST_No" character varying(20),
    "Is_Head_Office" boolean DEFAULT false,
    "Is_Active" boolean DEFAULT true,
    "Opening_Date" date,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_brand_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_brand_master (
    "Brand_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Brand_Code" character varying(30) NOT NULL,
    "Brand_Name" character varying(100) NOT NULL,
    "Logo_URL" character varying(500),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_brand_master_Brand_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_brand_master_Brand_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_brand_master_Brand_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_brand_master_Brand_ID_seq" OWNED BY public.tbl_brand_master."Brand_ID";


--
-- Name: tbl_card_charges_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_card_charges_master (
    "Charge_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Card_Type" character varying(20) NOT NULL,
    "Card_Network" character varying(20),
    "Surcharge_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Min_Surcharge_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_card_charges_master_Charge_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_card_charges_master_Charge_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_card_charges_master_Charge_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_card_charges_master_Charge_ID_seq" OWNED BY public.tbl_card_charges_master."Charge_ID";


--
-- Name: tbl_catalog_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_catalog_order_items (
    "Item_ID" integer NOT NULL,
    "Order_ID" integer,
    "Article_Number" character varying(50) NOT NULL,
    "Quantity" integer DEFAULT 1,
    "Notes" text
);


--
-- Name: tbl_catalog_order_items_Item_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_catalog_order_items_Item_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_catalog_order_items_Item_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_catalog_order_items_Item_ID_seq" OWNED BY public.tbl_catalog_order_items."Item_ID";


--
-- Name: tbl_catalog_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_catalog_orders (
    "Order_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Order_Number" character varying(50),
    "Customer_Name" character varying(100),
    "Customer_Mobile" character varying(20),
    "Notes" text,
    "Status" character varying(30) DEFAULT 'Pending'::character varying,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Updated_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_catalog_orders_Order_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_catalog_orders_Order_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_catalog_orders_Order_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_catalog_orders_Order_ID_seq" OWNED BY public.tbl_catalog_orders."Order_ID";


--
-- Name: tbl_catalog_wishlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_catalog_wishlist (
    "Wishlist_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Ornament_ID" integer,
    "Article_Number" character varying(50) NOT NULL,
    "Customer_Mobile" character varying(20),
    "Customer_ID" integer,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_catalog_wishlist_Wishlist_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_catalog_wishlist_Wishlist_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_catalog_wishlist_Wishlist_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_catalog_wishlist_Wishlist_ID_seq" OWNED BY public.tbl_catalog_wishlist."Wishlist_ID";


--
-- Name: tbl_chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_chart_of_accounts (
    "Account_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Account_Code" character varying(20) NOT NULL,
    "Account_Name" character varying(150) NOT NULL,
    "Account_Group" character varying(20) NOT NULL,
    "Account_Sub_Group" character varying(40),
    "Is_Bank_Account" boolean DEFAULT false NOT NULL,
    "Bank_Account_ID" integer,
    "Opening_Balance" numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    "Opening_Balance_Type" character varying(2) DEFAULT 'Dr'::character varying NOT NULL,
    "Is_System" boolean DEFAULT false NOT NULL,
    "Is_Active" boolean DEFAULT true NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_chart_of_accounts_Account_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_chart_of_accounts_Account_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_chart_of_accounts_Account_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_chart_of_accounts_Account_ID_seq" OWNED BY public.tbl_chart_of_accounts."Account_ID";


--
-- Name: tbl_cheque_register; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_cheque_register (
    "Cheque_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Account_ID" integer,
    "Cheque_Type" character varying(10) NOT NULL,
    "Party_Type" character varying(20),
    "Party_Name" character varying(100) NOT NULL,
    "Cheque_Number" character varying(50) NOT NULL,
    "Bank_Name" character varying(100),
    "Cheque_Date" date NOT NULL,
    "Amount" numeric(15,2) NOT NULL,
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Deposit_Date" date,
    "Clearing_Date" date,
    "Bounce_Charge" numeric(10,2) DEFAULT '0'::numeric,
    "Reference_Voucher_ID" character varying(50),
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_cheque_register_Cheque_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_cheque_register_Cheque_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_cheque_register_Cheque_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_cheque_register_Cheque_ID_seq" OWNED BY public.tbl_cheque_register."Cheque_ID";


--
-- Name: tbl_collection_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_collection_master (
    "Collection_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Collection_Code" character varying(30) NOT NULL,
    "Collection_Name" character varying(100) NOT NULL,
    "Season" character varying(50),
    "Year" character varying(10),
    "Description" text,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_collection_master_Collection_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_collection_master_Collection_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_collection_master_Collection_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_collection_master_Collection_ID_seq" OWNED BY public.tbl_collection_master."Collection_ID";


--
-- Name: tbl_counter_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_counter_master (
    "Counter_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20) NOT NULL,
    "Floor_ID" integer NOT NULL,
    "Counter_Code" character varying(20) NOT NULL,
    "Counter_Name" character varying(100) NOT NULL,
    "Counter_Type" character varying(30) DEFAULT 'Showcase'::character varying,
    "Capacity" integer DEFAULT 50,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_counter_master_Counter_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_counter_master_Counter_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_counter_master_Counter_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_counter_master_Counter_ID_seq" OWNED BY public.tbl_counter_master."Counter_ID";


--
-- Name: tbl_crm_followup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_crm_followup (
    "Followup_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Lead_ID" bigint,
    "Customer_ID" integer,
    "Followup_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Next_Followup_Date" date,
    "Contact_Mode" character varying(20),
    "Remarks" text NOT NULL,
    "Done_By" integer,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_crm_followup_Followup_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_crm_followup_Followup_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_crm_followup_Followup_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_crm_followup_Followup_ID_seq" OWNED BY public.tbl_crm_followup."Followup_ID";


--
-- Name: tbl_crm_lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_crm_lead (
    "Lead_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Lead_Name" character varying(100) NOT NULL,
    "Mobile" character varying(15) NOT NULL,
    "Email" character varying(100),
    "Source" character varying(30) DEFAULT 'Walk-in'::character varying,
    "Interested_In" character varying(200),
    "Assigned_To" integer,
    "Status" character varying(20) DEFAULT 'New'::character varying NOT NULL,
    "Converted_Customer_ID" integer,
    "Converted_Date" date,
    "Lost_Reason" character varying(200),
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_crm_lead_Lead_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_crm_lead_Lead_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_crm_lead_Lead_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_crm_lead_Lead_ID_seq" OWNED BY public.tbl_crm_lead."Lead_ID";


--
-- Name: tbl_custom_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_custom_order (
    "Order_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Order_Number" character varying(30) NOT NULL,
    "Order_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Customer_ID" integer,
    "Customer_Name" character varying(100),
    "Customer_Mobile" character varying(15),
    "Item_Description" text,
    "Estimated_Weight" numeric(10,3),
    "Estimated_Amount" numeric(15,2),
    "Advance_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Expected_Delivery" date,
    "Assigned_Karigar_ID" integer,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_custom_order_Order_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_custom_order_Order_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_custom_order_Order_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_custom_order_Order_ID_seq" OWNED BY public.tbl_custom_order."Order_ID";


--
-- Name: tbl_customer_display_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_customer_display_settings (
    "Setting_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Display_Logo" boolean DEFAULT true,
    "Logo_URL" character varying(500),
    "Show_Item_Image" boolean DEFAULT true,
    "Show_Gold_Rate_Live" boolean DEFAULT true,
    "Show_Customer_Name" boolean DEFAULT true,
    "Show_Customer_Photo" boolean DEFAULT false,
    "Show_Cost_Price" boolean DEFAULT false,
    "Show_Making_Charge_Individual" boolean DEFAULT true,
    "Show_Total_Weight_Only" boolean DEFAULT false,
    "Show_Discount_Line" boolean DEFAULT true,
    "Show_QR_Code" boolean DEFAULT true,
    "Show_UPI_QR" boolean DEFAULT true,
    "Background_Color" character varying(7) DEFAULT '#1A1A1A'::character varying,
    "Text_Color" character varying(7) DEFAULT '#FFFFFF'::character varying,
    "Accent_Color" character varying(7) DEFAULT '#FFD700'::character varying,
    "Font_Scale_Factor" numeric(3,2) DEFAULT '1'::numeric,
    "Font_Family" character varying(50) DEFAULT 'Arial'::character varying,
    "Header_Message" character varying(200) DEFAULT 'Welcome'::character varying,
    "Footer_Message" character varying(200) DEFAULT '100% BIS Hallmarked Gold'::character varying,
    "Auto_Clear_After_Seconds" integer DEFAULT 10,
    "Auto_Refresh_Interval" integer DEFAULT 1,
    "Show_Slideshow_When_Idle" boolean DEFAULT true,
    "Slideshow_Image_URLs" jsonb,
    "Slideshow_Interval" integer DEFAULT 5,
    "Is_Keyboard_Blocked" boolean DEFAULT true,
    "Is_Mouse_Blocked" boolean DEFAULT true,
    "Is_Print_Blocked" boolean DEFAULT true,
    "Screen_Resolution_Width" integer DEFAULT 1920,
    "Screen_Resolution_Height" integer DEFAULT 1080,
    "Is_Fullscreen" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Updated_By" character varying(50),
    "Last_Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_customer_display_settings_Setting_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_customer_display_settings_Setting_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_customer_display_settings_Setting_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_customer_display_settings_Setting_ID_seq" OWNED BY public.tbl_customer_display_settings."Setting_ID";


--
-- Name: tbl_customer_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_customer_feedback (
    "Feedback_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_ID" integer,
    "Sale_ID" bigint,
    "Rating" integer NOT NULL,
    "Comments" text,
    "Feedback_Type" character varying(30) DEFAULT 'General'::character varying,
    "Status" character varying(20) DEFAULT 'Open'::character varying,
    "Resolution_Notes" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_customer_feedback_Feedback_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_customer_feedback_Feedback_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_customer_feedback_Feedback_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_customer_feedback_Feedback_ID_seq" OWNED BY public.tbl_customer_feedback."Feedback_ID";


--
-- Name: tbl_customer_insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_customer_insurance (
    "Insurance_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_ID" integer,
    "Sale_ID" bigint,
    "Ornament_ID" bigint,
    "Policy_ID" integer,
    "Certificate_Number" character varying(50),
    "Sum_Insured" numeric(15,2) NOT NULL,
    "Premium_Amount" numeric(15,2) NOT NULL,
    "Start_Date" date NOT NULL,
    "Expiry_Date" date NOT NULL,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Claim_Date" date,
    "Claim_Amount" numeric(15,2),
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_customer_insurance_Insurance_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_customer_insurance_Insurance_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_customer_insurance_Insurance_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_customer_insurance_Insurance_ID_seq" OWNED BY public.tbl_customer_insurance."Insurance_ID";


--
-- Name: tbl_customer_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_customer_master (
    "Customer_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_Code" character varying(30) NOT NULL,
    "Customer_Name" character varying(100) NOT NULL,
    "Mobile_1" character varying(15) NOT NULL,
    "Mobile_2" character varying(15),
    "Email" character varying(100),
    "Date_Of_Birth" date,
    "Anniversary_Date" date,
    "Occupation" character varying(50),
    "Income_Group" character varying(20),
    "Address_Line1" character varying(200),
    "Address_Line2" character varying(200),
    "City" character varying(50),
    "State" character varying(50),
    "Pincode" character varying(10),
    "GST_No" character varying(20),
    "PAN_No" character varying(20),
    "Loyalty_Points" numeric(10,2) DEFAULT '0'::numeric,
    "Total_Purchase_Value" numeric(15,2) DEFAULT '0'::numeric,
    "Total_Purchase_Count" integer DEFAULT 0,
    "Last_Purchase_Date" date,
    "Preferred_Type" character varying(30),
    "Preferred_Purity" character varying(10),
    "Family_Member_1_Name" character varying(100),
    "Family_Member_1_Relation" character varying(20),
    "Family_Member_2_Name" character varying(100),
    "Family_Member_2_Relation" character varying(20),
    "Referred_By" character varying(100),
    "Is_Wholesale" boolean DEFAULT false,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Notes" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_customer_master."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_customer_master."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_customer_master_Customer_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_customer_master_Customer_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_customer_master_Customer_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_customer_master_Customer_ID_seq" OWNED BY public.tbl_customer_master."Customer_ID";


--
-- Name: tbl_day_close; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_day_close (
    "Close_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Close_Date" date NOT NULL,
    "Opening_Cash" numeric(15,2) DEFAULT '0'::numeric,
    "Cash_Sales" numeric(15,2) DEFAULT '0'::numeric,
    "UPI_Sales" numeric(15,2) DEFAULT '0'::numeric,
    "Card_Sales" numeric(15,2) DEFAULT '0'::numeric,
    "Other_Sales" numeric(15,2) DEFAULT '0'::numeric,
    "Total_Sales" numeric(15,2) DEFAULT '0'::numeric,
    "Cash_Expenses" numeric(15,2) DEFAULT '0'::numeric,
    "Cash_In_Hand" numeric(15,2) DEFAULT '0'::numeric,
    "Verified_Cash" numeric(15,2) DEFAULT '0'::numeric,
    "Difference" numeric(15,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Open'::character varying,
    "Closed_By" integer,
    "Closed_At" timestamp with time zone,
    "Remarks" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_day_close_Close_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_day_close_Close_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_day_close_Close_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_day_close_Close_ID_seq" OWNED BY public.tbl_day_close."Close_ID";


--
-- Name: tbl_design_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_design_master (
    "Design_ID" integer NOT NULL,
    "Type_ID" integer,
    "Design_Code" character varying(30) NOT NULL,
    "Design_Name" character varying(100) NOT NULL,
    "Collection_Name" character varying(50),
    "Estimated_Gold_Weight" numeric(10,3),
    "Estimated_Stone_Weight" numeric(10,3),
    "Estimated_Making_Charge" numeric(10,2),
    "Estimated_Wastage_Percent" numeric(5,2),
    "Designer_Name" character varying(50),
    "Category" character varying(30),
    "Is_Custom_Only" boolean DEFAULT false,
    "Min_Order_Quantity" integer DEFAULT 1,
    "Image_URL" character varying(500),
    "CAD_File_URL" character varying(500),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Notes" text
);


--
-- Name: tbl_design_master_Design_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_design_master_Design_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_design_master_Design_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_design_master_Design_ID_seq" OWNED BY public.tbl_design_master."Design_ID";


--
-- Name: tbl_device_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_device_master (
    "Device_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Device_Name" character varying(100),
    "Device_Type" character varying(20) NOT NULL,
    "Operating_System" character varying(50),
    "App_Version" character varying(20),
    "DB_Schema_Version" character varying(20),
    "Last_Sync_Date" timestamp with time zone,
    "Last_IP_Address" character varying(50),
    "Status" character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    "Registered_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Revoked_Date" timestamp with time zone,
    "Revoked_Reason" text
);


--
-- Name: tbl_diamond_color_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diamond_color_master (
    "Color_ID" integer NOT NULL,
    "Color_Code" character varying(10) NOT NULL,
    "Color_Name" character varying(50) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_diamond_color_master_Color_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_diamond_color_master_Color_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_diamond_color_master_Color_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_diamond_color_master_Color_ID_seq" OWNED BY public.tbl_diamond_color_master."Color_ID";


--
-- Name: tbl_diamond_quality_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diamond_quality_master (
    "Quality_ID" integer NOT NULL,
    "Quality_Code" character varying(20) NOT NULL,
    "Quality_Name" character varying(50) NOT NULL,
    "Description" text,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_diamond_quality_master_Quality_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_diamond_quality_master_Quality_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_diamond_quality_master_Quality_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_diamond_quality_master_Quality_ID_seq" OWNED BY public.tbl_diamond_quality_master."Quality_ID";


--
-- Name: tbl_diamond_shape_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_diamond_shape_master (
    "Shape_ID" integer NOT NULL,
    "Shape_Code" character varying(20) NOT NULL,
    "Shape_Name" character varying(50) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_diamond_shape_master_Shape_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_diamond_shape_master_Shape_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_diamond_shape_master_Shape_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_diamond_shape_master_Shape_ID_seq" OWNED BY public.tbl_diamond_shape_master."Shape_ID";


--
-- Name: tbl_display_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_display_settings (
    "Setting_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Setting_Type" character varying(20) NOT NULL,
    "Reference_ID" character varying(50) NOT NULL,
    "Matrix_JSON" jsonb NOT NULL,
    "Created_By" character varying(100),
    "Updated_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_display_settings_Setting_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_display_settings_Setting_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_display_settings_Setting_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_display_settings_Setting_ID_seq" OWNED BY public.tbl_display_settings."Setting_ID";


--
-- Name: tbl_einvoice_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_einvoice_log (
    "Log_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Sale_ID" bigint NOT NULL,
    "IRN" character varying(100),
    "Ack_Number" character varying(50),
    "Ack_Date" timestamp with time zone,
    "QR_Code_Data" text,
    "Signed_Invoice_URL" character varying(500),
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Error_Message" text,
    "Cancelled_Date" timestamp with time zone,
    "Cancellation_Reason" character varying(200),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_einvoice_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_einvoice_log_Log_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_einvoice_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_einvoice_log_Log_ID_seq" OWNED BY public.tbl_einvoice_log."Log_ID";


--
-- Name: tbl_employee_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_employee_details (
    "User_ID" integer NOT NULL,
    "Date_Of_Birth" date,
    "Aadhaar_No" character varying(20),
    "PAN_No" character varying(20),
    "Bank_Account_No" character varying(30),
    "IFSC_Code" character varying(20),
    "Designation" character varying(100),
    "Date_Of_Joining" date,
    "Date_Of_Leaving" date,
    "Emergency_Contact_Name" character varying(100),
    "Emergency_Contact_Mobile" character varying(15),
    "Address" text,
    "Photo_URL" character varying(500),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_erp_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_erp_modules (
    "Module_ID" integer NOT NULL,
    "Module_Key" character varying(50) NOT NULL,
    "Module_Name" character varying(100) NOT NULL,
    "Module_Group" character varying(50),
    "Icon" character varying(50),
    "Route" character varying(100),
    "Sort_Order" integer DEFAULT 0,
    "Is_Core" boolean DEFAULT false,
    "Default_Retailer" boolean DEFAULT false,
    "Default_Wholesaler" boolean DEFAULT false,
    "Default_Manufacturer" boolean DEFAULT false,
    "Default_Hybrid" boolean DEFAULT true,
    "Description" character varying(300)
);


--
-- Name: COLUMN tbl_erp_modules."Is_Core"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_erp_modules."Is_Core" IS 'Core modules cannot be disabled';


--
-- Name: tbl_erp_modules_Module_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_erp_modules_Module_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_erp_modules_Module_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_erp_modules_Module_ID_seq" OWNED BY public.tbl_erp_modules."Module_ID";


--
-- Name: tbl_floor_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_floor_master (
    "Floor_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20) NOT NULL,
    "Floor_Code" character varying(20) NOT NULL,
    "Floor_Name" character varying(100) NOT NULL,
    "Floor_Number" integer DEFAULT 0,
    "Description" character varying(200),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_floor_master_Floor_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_floor_master_Floor_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_floor_master_Floor_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_floor_master_Floor_ID_seq" OWNED BY public.tbl_floor_master."Floor_ID";


--
-- Name: tbl_gem_certificate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_gem_certificate (
    "Certificate_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Ornament_ID" bigint,
    "Stone_ID" integer,
    "Certifying_Lab" character varying(50) NOT NULL,
    "Certificate_Number" character varying(50) NOT NULL,
    "Certificate_Date" date,
    "Carat_Weight" numeric(10,3),
    "Color_Grade" character varying(10),
    "Clarity_Grade" character varying(10),
    "Cut_Grade" character varying(20),
    "Certificate_URL" character varying(500),
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_gem_certificate_Certificate_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_gem_certificate_Certificate_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_gem_certificate_Certificate_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_gem_certificate_Certificate_ID_seq" OWNED BY public.tbl_gem_certificate."Certificate_ID";


--
-- Name: tbl_gemstone_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_gemstone_master (
    "Stone_ID" integer NOT NULL,
    "Stone_Code" character varying(20) NOT NULL,
    "Stone_Name" character varying(50) NOT NULL,
    "Stone_Color" character varying(30),
    "Stone_Clarity" character varying(20),
    "Stone_Cut" character varying(20),
    "Stone_Carat_Weight" numeric(10,3),
    "Price_Per_Carat" numeric(15,2),
    "Supplier_ID" integer,
    "Certificate_No" character varying(50),
    "Is_Natural" boolean DEFAULT true,
    "Is_Lab_Grown" boolean DEFAULT false,
    "Origin_Country" character varying(50),
    "Image_URL" character varying(500),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Notes" text
);


--
-- Name: tbl_gemstone_master_Stone_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_gemstone_master_Stone_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_gemstone_master_Stone_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_gemstone_master_Stone_ID_seq" OWNED BY public.tbl_gemstone_master."Stone_ID";


--
-- Name: tbl_gift_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_gift_vouchers (
    "Voucher_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Voucher_Code" character varying(50) NOT NULL,
    "Voucher_Value" numeric(10,2) NOT NULL,
    "Used_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Balance_Amount" numeric(10,2) NOT NULL,
    "Issue_Date" date NOT NULL,
    "Expiry_Date" date,
    "Issued_To_Customer_ID" integer,
    "Used_In_Sale_ID" bigint,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_gift_vouchers_Voucher_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_gift_vouchers_Voucher_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_gift_vouchers_Voucher_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_gift_vouchers_Voucher_ID_seq" OWNED BY public.tbl_gift_vouchers."Voucher_ID";


--
-- Name: tbl_gold_rate_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_gold_rate_history (
    "Rate_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20),
    "Rate_Date" date NOT NULL,
    "Rate_22K" numeric(10,2),
    "Rate_24K" numeric(10,2),
    "Rate_18K" numeric(10,2),
    "Rate_Silver" numeric(10,2),
    "Rate_Platinum" numeric(10,2),
    "Source" character varying(20) DEFAULT 'Manual'::character varying,
    "Set_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_gold_rate_history_Rate_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_gold_rate_history_Rate_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_gold_rate_history_Rate_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_gold_rate_history_Rate_ID_seq" OWNED BY public.tbl_gold_rate_history."Rate_ID";


--
-- Name: tbl_hidden_location_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_hidden_location_master (
    "Hidden_Location_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Location_Code" character varying(20) NOT NULL,
    "Location_Name" character varying(100) NOT NULL,
    "Description" character varying(200),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_hidden_location_master_Hidden_Location_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_hidden_location_master_Hidden_Location_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_hidden_location_master_Hidden_Location_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_hidden_location_master_Hidden_Location_ID_seq" OWNED BY public.tbl_hidden_location_master."Hidden_Location_ID";


--
-- Name: tbl_holiday_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_holiday_master (
    "Holiday_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Holiday_Date" date NOT NULL,
    "Holiday_Name" character varying(100) NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_holiday_master_Holiday_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_holiday_master_Holiday_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_holiday_master_Holiday_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_holiday_master_Holiday_ID_seq" OWNED BY public.tbl_holiday_master."Holiday_ID";


--
-- Name: tbl_hsn_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_hsn_master (
    "HSN_ID" integer NOT NULL,
    "HSN_Code" character varying(20) NOT NULL,
    "Description" character varying(200),
    "GST_Percentage" numeric(5,2) DEFAULT '3'::numeric NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_hsn_master_HSN_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_hsn_master_HSN_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_hsn_master_HSN_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_hsn_master_HSN_ID_seq" OWNED BY public.tbl_hsn_master."HSN_ID";


--
-- Name: tbl_huid_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_huid_master (
    "HUID_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "HUID_Number" character varying(50) NOT NULL,
    "Ornament_ID" bigint,
    "Article_Number" character varying(50),
    "Purity_Code" character varying(10),
    "Weight" numeric(10,3),
    "Assay_Centre" character varying(100),
    "Hallmark_Date" date,
    "Certificate_URL" character varying(500),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_huid_master_HUID_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_huid_master_HUID_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_huid_master_HUID_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_huid_master_HUID_ID_seq" OWNED BY public.tbl_huid_master."HUID_ID";


--
-- Name: tbl_incentive_slab_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_incentive_slab_master (
    "Slab_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Slab_Name" character varying(100) NOT NULL,
    "Amount_From" numeric(15,2) NOT NULL,
    "Amount_To" numeric(15,2),
    "Incentive_Pct" numeric(5,2) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_incentive_slab_master_Slab_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_incentive_slab_master_Slab_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_incentive_slab_master_Slab_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_incentive_slab_master_Slab_ID_seq" OWNED BY public.tbl_incentive_slab_master."Slab_ID";


--
-- Name: tbl_insurance_policy_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_insurance_policy_master (
    "Policy_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Insurer_Name" character varying(100) NOT NULL,
    "Policy_Number" character varying(50) NOT NULL,
    "Coverage_Type" character varying(30),
    "Premium_Rate_Pct" numeric(5,2),
    "Premium_Slab_Rules" jsonb,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_insurance_policy_master_Policy_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_insurance_policy_master_Policy_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_insurance_policy_master_Policy_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_insurance_policy_master_Policy_ID_seq" OWNED BY public.tbl_insurance_policy_master."Policy_ID";


--
-- Name: tbl_invoice_preview_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_invoice_preview_data (
    "Preview_ID" integer NOT NULL,
    "Document_Type" character varying(40) NOT NULL,
    "Sample_Data" jsonb NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_invoice_preview_data_Preview_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_invoice_preview_data_Preview_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_invoice_preview_data_Preview_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_invoice_preview_data_Preview_ID_seq" OWNED BY public.tbl_invoice_preview_data."Preview_ID";


--
-- Name: tbl_invoice_studio_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_invoice_studio_templates (
    "Template_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20),
    "Document_Type" character varying(40) NOT NULL,
    "Template_Name" character varying(100) NOT NULL,
    "Template_Code" character varying(30),
    "Is_Default" boolean DEFAULT false,
    "Is_Active" boolean DEFAULT true,
    "Paper_Size" character varying(20) DEFAULT 'A4'::character varying,
    "Canvas_Width_MM" numeric(8,2) DEFAULT '210'::numeric,
    "Canvas_Height_MM" numeric(8,2) DEFAULT '297'::numeric,
    "Margin_Top" numeric(6,2) DEFAULT '10'::numeric,
    "Margin_Bottom" numeric(6,2) DEFAULT '10'::numeric,
    "Margin_Left" numeric(6,2) DEFAULT '10'::numeric,
    "Margin_Right" numeric(6,2) DEFAULT '10'::numeric,
    "Orientation" character varying(10) DEFAULT 'Portrait'::character varying,
    "Primary_Color" character varying(7) DEFAULT '#B8860B'::character varying,
    "Secondary_Color" character varying(7) DEFAULT '#1A1A1A'::character varying,
    "Background_Color" character varying(7) DEFAULT '#FFFFFF'::character varying,
    "Font_Family" character varying(50) DEFAULT 'Arial'::character varying,
    "Base_Font_Size" integer DEFAULT 10,
    "Components" jsonb DEFAULT '[]'::jsonb,
    "GST_Config" jsonb DEFAULT '{}'::jsonb,
    "Variables" jsonb DEFAULT '{}'::jsonb,
    "Custom_CSS" text,
    "Custom_JS" text,
    "Logo_URL" text,
    "Stamp_URL" text,
    "Signature_URL" text,
    "Version" integer DEFAULT 1,
    "Version_History" jsonb DEFAULT '[]'::jsonb,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Updated_By" character varying(50),
    "Last_Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_invoice_studio_templates_Template_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_invoice_studio_templates_Template_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_invoice_studio_templates_Template_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_invoice_studio_templates_Template_ID_seq" OWNED BY public.tbl_invoice_studio_templates."Template_ID";


--
-- Name: tbl_invoice_template_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_invoice_template_master (
    "Template_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20),
    "Document_Type" character varying(30) NOT NULL,
    "Branch_ID" character varying(20),
    "Template_Name" character varying(100) NOT NULL,
    "Template_Version" integer DEFAULT 1,
    "Is_Active" boolean DEFAULT true,
    "Is_Default" boolean DEFAULT false,
    "Paper_Size" character varying(20) DEFAULT 'A4'::character varying,
    "Orientation" character varying(10) DEFAULT 'Portrait'::character varying,
    "Font_Family" character varying(50) DEFAULT 'Arial'::character varying,
    "Font_Size" integer DEFAULT 10,
    "Primary_Color" character varying(7) DEFAULT '#B8860B'::character varying,
    "Secondary_Color" character varying(7) DEFAULT '#1A1A1A'::character varying,
    "Background_Color" character varying(7) DEFAULT '#FFFFFF'::character varying,
    "Header_Logo_URL" text,
    "Header_Text" jsonb,
    "Header_Address" jsonb,
    "Header_Contact" jsonb,
    "Footer_Text" jsonb,
    "Footer_Message" character varying(500),
    "Field_Visibility" jsonb,
    "Field_Order" jsonb,
    "Field_Labels" jsonb,
    "Is_Tax_Invoice" boolean DEFAULT true,
    "Show_Round_Off" boolean DEFAULT true,
    "Show_GST_Breakdown" boolean DEFAULT true,
    "Show_Old_Gold_Details" boolean DEFAULT false,
    "Show_Karigar_Details" boolean DEFAULT false,
    "Show_Wastage_Column" boolean DEFAULT false,
    "Show_Hallmark_Number" boolean DEFAULT true,
    "Show_QR_Code" boolean DEFAULT true,
    "Signature_Field_Label" character varying(50) DEFAULT 'Customer Signature'::character varying,
    "Signature_Field_Required" boolean DEFAULT true,
    "Copy_Type" character varying(20) DEFAULT 'Original'::character varying,
    "Custom_CSS" text,
    "Custom_HTML_Header" text,
    "Custom_HTML_Footer" text,
    "Cache_PDF_HTML" text,
    "Cache_Last_Generated" timestamp with time zone,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Updated_By" character varying(50),
    "Last_Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_invoice_template_master_Template_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_invoice_template_master_Template_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_invoice_template_master_Template_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_invoice_template_master_Template_ID_seq" OWNED BY public.tbl_invoice_template_master."Template_ID";


--
-- Name: tbl_issue_to_karigar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_issue_to_karigar (
    "Issue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Karigar_ID" integer,
    "Issue_Number" character varying(30) NOT NULL,
    "Issue_Date" date NOT NULL,
    "Expected_Return_Date" date,
    "Gold_Weight_Issued" numeric(10,3) NOT NULL,
    "Purity_ID" integer,
    "Gold_Rate_At_Issue" numeric(10,2) NOT NULL,
    "Total_Value_Issued" numeric(15,2),
    "Design_ID" integer,
    "Wastage_Allowed_Percent" numeric(5,2) DEFAULT '3'::numeric,
    "Karigar_Wages_Rate" numeric(10,2),
    "Estimated_Wages" numeric(15,2),
    "Status" character varying(20) DEFAULT 'Issued'::character varying,
    "Return_Date" date,
    "Returned_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Wastage_Used" numeric(10,3) DEFAULT '0'::numeric,
    "Missing_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Missing_Value" numeric(15,2) DEFAULT '0'::numeric,
    "Final_Wages_Paid" numeric(15,2) DEFAULT '0'::numeric,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_issue_to_karigar."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_issue_to_karigar."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_issue_to_karigar_Issue_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_issue_to_karigar_Issue_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_issue_to_karigar_Issue_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_issue_to_karigar_Issue_ID_seq" OWNED BY public.tbl_issue_to_karigar."Issue_ID";


--
-- Name: tbl_item_type_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_item_type_master (
    "Type_ID" integer NOT NULL,
    "Type_Code" character varying(20) NOT NULL,
    "Type_Name" character varying(50) NOT NULL,
    "Category" character varying(20) NOT NULL,
    "Is_Precious" boolean DEFAULT true,
    "Is_Gold" boolean DEFAULT true,
    "Is_Silver" boolean DEFAULT false,
    "Default_Making_Charge" numeric(10,2),
    "Default_Wastage_Percent" numeric(5,2),
    "HSN_Code" character varying(20),
    "GST_Percentage" numeric(5,2) DEFAULT '3'::numeric,
    "Is_Active" boolean DEFAULT true,
    "Image_URL" character varying(500),
    "Description" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_item_type_master_Type_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_item_type_master_Type_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_item_type_master_Type_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_item_type_master_Type_ID_seq" OWNED BY public.tbl_item_type_master."Type_ID";


--
-- Name: tbl_license_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_license_master (
    "License_ID" integer NOT NULL,
    "License_Key" character varying(50) NOT NULL,
    "Tenant_ID" character varying(20),
    "License_Type" character varying(20),
    "Issued_Date" date NOT NULL,
    "Expiry_Date" date NOT NULL,
    "Max_Users" integer DEFAULT 5,
    "Max_Branches" integer DEFAULT 1,
    "Is_Active" boolean DEFAULT true,
    "Is_Revoked" boolean DEFAULT false,
    "Revocation_Reason" text,
    "Hardware_ID" character varying(200),
    "Last_Verified" timestamp with time zone,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_license_master_License_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_license_master_License_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_license_master_License_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_license_master_License_ID_seq" OWNED BY public.tbl_license_master."License_ID";


--
-- Name: tbl_loyalty_points_slab; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_loyalty_points_slab (
    "Slab_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Amount_From" numeric(15,2) NOT NULL,
    "Amount_To" numeric(15,2),
    "Metal_Type" character varying(20),
    "Points_Per_Unit" numeric(10,4) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_loyalty_points_slab_Slab_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_loyalty_points_slab_Slab_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_loyalty_points_slab_Slab_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_loyalty_points_slab_Slab_ID_seq" OWNED BY public.tbl_loyalty_points_slab."Slab_ID";


--
-- Name: tbl_loyalty_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_loyalty_transactions (
    "Loyalty_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_ID" integer,
    "Txn_Type" character varying(20) NOT NULL,
    "Points" numeric(10,2) NOT NULL,
    "Running_Balance" numeric(10,2) NOT NULL,
    "Sale_ID" bigint,
    "Description" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_loyalty_transactions_Loyalty_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_loyalty_transactions_Loyalty_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_loyalty_transactions_Loyalty_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_loyalty_transactions_Loyalty_ID_seq" OWNED BY public.tbl_loyalty_transactions."Loyalty_ID";


--
-- Name: tbl_making_charge_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_making_charge_master (
    "MC_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "MC_Name" character varying(100) NOT NULL,
    "Charge_Type" character varying(20) DEFAULT 'Per Gram'::character varying,
    "Charge_Value" numeric(10,2) NOT NULL,
    "Type_ID" integer,
    "Purity_Code" character varying(10),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_making_charge_master_MC_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_making_charge_master_MC_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_making_charge_master_MC_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_making_charge_master_MC_ID_seq" OWNED BY public.tbl_making_charge_master."MC_ID";


--
-- Name: tbl_melting_refining_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_melting_refining_log (
    "Log_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Process_Type" character varying(20) NOT NULL,
    "Metal_Type" character varying(20) NOT NULL,
    "Purity_In_Code" character varying(10),
    "Purity_Out_Code" character varying(10),
    "Weight_In" numeric(10,3) NOT NULL,
    "Weight_Out" numeric(10,3),
    "Loss_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Loss_Pct" numeric(5,2),
    "Refiner_Vendor_ID" integer,
    "Log_Date" date NOT NULL,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_melting_refining_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_melting_refining_log_Log_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_melting_refining_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_melting_refining_log_Log_ID_seq" OWNED BY public.tbl_melting_refining_log."Log_ID";


--
-- Name: tbl_mobile_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_mobile_otp (
    "OTP_ID" integer NOT NULL,
    "Mobile" character varying(20) NOT NULL,
    "OTP" character varying(6) NOT NULL,
    "Purpose" character varying(30) DEFAULT 'LOGIN'::character varying,
    "Is_Used" boolean DEFAULT false,
    "Expires_At" timestamp with time zone NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_mobile_otp_OTP_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_mobile_otp_OTP_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_mobile_otp_OTP_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_mobile_otp_OTP_ID_seq" OWNED BY public.tbl_mobile_otp."OTP_ID";


--
-- Name: tbl_mould_bom_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_mould_bom_stock (
    "Mould_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Design_ID" integer,
    "Mould_Name" character varying(100) NOT NULL,
    "Rubber_Type" character varying(50),
    "Stock_Qty" integer DEFAULT 0,
    "Standard_Wax_Weight" numeric(10,3),
    "Standard_Wastage_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_mould_bom_stock_Mould_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_mould_bom_stock_Mould_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_mould_bom_stock_Mould_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_mould_bom_stock_Mould_ID_seq" OWNED BY public.tbl_mould_bom_stock."Mould_ID";


--
-- Name: tbl_non_tag_issue_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_non_tag_issue_header (
    "NTA_Issue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Voucher_Number" character varying(40) NOT NULL,
    "Party_ID" bigint,
    "Issue_Date" date NOT NULL,
    "Expected_Return_Date" date,
    "Total_Items_Issued" integer DEFAULT 0 NOT NULL,
    "Total_Weight_Issued" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Value_Issued" numeric(15,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_By" character varying(50),
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Cancelled_By" character varying(50),
    "Cancelled_Date" timestamp with time zone,
    "Cancellation_Reason" text,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_non_tag_issue_header_NTA_Issue_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_non_tag_issue_header_NTA_Issue_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_non_tag_issue_header_NTA_Issue_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_non_tag_issue_header_NTA_Issue_ID_seq" OWNED BY public.tbl_non_tag_issue_header."NTA_Issue_ID";


--
-- Name: tbl_non_tag_issue_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_non_tag_issue_items (
    "NTA_Issue_Item_ID" bigint NOT NULL,
    "NTA_Issue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Type_ID" integer,
    "Item_Type" character varying(100),
    "Design_ID" integer,
    "Design_Type" character varying(100),
    "Category" character varying(100),
    "Gross_Weight" numeric(10,3),
    "Purity_ID" integer,
    "Metal_Type" character varying(50),
    "Approx_Value" numeric(15,2),
    "Image_URL" character varying(500),
    "Remarks" text,
    "Item_Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Received_In_Receive_ID" bigint,
    "Received_Date" timestamp with time zone,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_non_tag_issue_items_NTA_Issue_Item_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_non_tag_issue_items_NTA_Issue_Item_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_non_tag_issue_items_NTA_Issue_Item_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_non_tag_issue_items_NTA_Issue_Item_ID_seq" OWNED BY public.tbl_non_tag_issue_items."NTA_Issue_Item_ID";


--
-- Name: tbl_non_tag_receive_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_non_tag_receive_header (
    "NTA_Receive_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Voucher_Number" character varying(40) NOT NULL,
    "NTA_Issue_ID" bigint NOT NULL,
    "Receive_Date" date NOT NULL,
    "Items_Received_Count" integer DEFAULT 0 NOT NULL,
    "Total_Weight_Received" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Value_Received" numeric(15,2) DEFAULT '0'::numeric,
    "Remarks" text,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_non_tag_receive_header_NTA_Receive_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_non_tag_receive_header_NTA_Receive_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_non_tag_receive_header_NTA_Receive_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_non_tag_receive_header_NTA_Receive_ID_seq" OWNED BY public.tbl_non_tag_receive_header."NTA_Receive_ID";


--
-- Name: tbl_old_gold_exchange; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_old_gold_exchange (
    "Exchange_ID" bigint NOT NULL,
    "Sale_ID" bigint,
    "Tenant_ID" character varying(20) NOT NULL,
    "Customer_ID" integer,
    "Exchange_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Old_Gold_Weight" numeric(10,3) NOT NULL,
    "Old_Gold_Purity_Code" character varying(10),
    "Purity_Percentage" numeric(5,2),
    "Melting_Deduction_Percent" numeric(5,2) DEFAULT '2'::numeric,
    "Melting_Deduction_Weight" numeric(10,3),
    "Net_Exchange_Weight" numeric(10,3),
    "Gold_Rate_At_Exchange" numeric(10,2),
    "Total_Value" numeric(15,2) NOT NULL,
    "Used_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Balance_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Certificate_No" character varying(50),
    "Tested_By" character varying(50),
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Voucher_Number" character varying(30),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_old_gold_exchange_Exchange_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_old_gold_exchange_Exchange_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_old_gold_exchange_Exchange_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_old_gold_exchange_Exchange_ID_seq" OWNED BY public.tbl_old_gold_exchange."Exchange_ID";


--
-- Name: tbl_ornament_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_ornament_master (
    "Ornament_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Article_Number" character varying(50) NOT NULL,
    "Type_ID" integer,
    "Design_ID" integer,
    "Purity_ID" integer,
    "Gross_Weight" numeric(10,3) NOT NULL,
    "Net_Gold_Weight" numeric(10,3) NOT NULL,
    "Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Wastage_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Melting_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Stone_ID" integer,
    "Number_Of_Stones" integer DEFAULT 0,
    "Total_Stone_Carat" numeric(10,3) DEFAULT '0'::numeric,
    "Current_Gold_Rate" numeric(10,2) NOT NULL,
    "Base_Making_Charge_Per_Gram" numeric(10,2) NOT NULL,
    "Final_Making_Charge_Total" numeric(10,2),
    "Wastage_Percentage" numeric(5,2) DEFAULT '3'::numeric,
    "Wastage_Amount" numeric(10,2),
    "Discount_Percentage" numeric(5,2) DEFAULT '0'::numeric,
    "Discount_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Taxable_Value" numeric(15,2),
    "GST_Amount" numeric(15,2),
    "Total_Price" numeric(15,2),
    "Supplier_ID" integer,
    "Karigar_ID" integer,
    "Purchase_Cost" numeric(15,2) NOT NULL,
    "Stock_Quantity" integer DEFAULT 1,
    "Min_Stock_Level" integer DEFAULT 5,
    "Physical_Location" character varying(50),
    "Hallmark_Certificate_No" character varying(50),
    "Hallmark_Date" date,
    "Is_Sold" boolean DEFAULT false,
    "Is_Returned" boolean DEFAULT false,
    "Is_Active" boolean DEFAULT true,
    "Is_Stock_Available" boolean DEFAULT true,
    "Is_On_Display" boolean DEFAULT false,
    "Is_On_Approval" boolean DEFAULT false,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Updated_By" character varying(50),
    "Last_Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Physical_Verify_Date" date,
    "Special_Instructions" text,
    "Certification_Image_URL" character varying(500),
    "Product_Image_URL" character varying(500),
    "QR_Code_Data" text,
    "HUID_Number" character varying(50),
    "Collection_ID" integer,
    "Brand_ID" integer,
    "SubCat_ID" integer,
    "RFID_Tag" character varying(100),
    "MC_ID" integer,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Bin_Source" character varying(50),
    "Bin_Voucher_ID" character varying(50),
    "Floor_ID" integer,
    "Counter_ID" integer,
    "Tray_ID" integer,
    "Is_Hidden" boolean DEFAULT false NOT NULL,
    "Hidden_Location_ID" integer,
    "Hidden_By" character varying(50),
    "Hidden_Date" timestamp with time zone,
    "Hidden_Reason" text,
    "Restored_By" character varying(50),
    "Restored_Date" timestamp with time zone,
    "Approval_Issue_ID" bigint,
    "Approval_Out_By" character varying(50),
    "Approval_Out_Date" timestamp with time zone,
    "Approval_Receive_ID" bigint,
    "Approval_Received_By" character varying(50),
    "Approval_Received_Date" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_ornament_master."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_ornament_master."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_ornament_master_Ornament_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_ornament_master_Ornament_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_ornament_master_Ornament_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_ornament_master_Ornament_ID_seq" OWNED BY public.tbl_ornament_master."Ornament_ID";


--
-- Name: tbl_pawn_loan_guarantor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pawn_loan_guarantor (
    "Guarantor_ID" bigint NOT NULL,
    "Loan_ID" bigint NOT NULL,
    "Guarantor_Name" character varying(100) NOT NULL,
    "Mobile" character varying(15) NOT NULL,
    "Address" text,
    "Relation_To_Borrower" character varying(50),
    "ID_Proof_Type" character varying(30),
    "ID_Proof_Number" character varying(50),
    "ID_Proof_URL" character varying(500),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_pawn_loan_guarantor_Guarantor_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pawn_loan_guarantor_Guarantor_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pawn_loan_guarantor_Guarantor_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pawn_loan_guarantor_Guarantor_ID_seq" OWNED BY public.tbl_pawn_loan_guarantor."Guarantor_ID";


--
-- Name: tbl_pawn_loan_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pawn_loan_header (
    "Loan_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Loan_Number" character varying(30) NOT NULL,
    "Customer_ID" integer,
    "Loan_Date" date NOT NULL,
    "Total_Gross_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Net_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Appraised_Value" numeric(15,2) NOT NULL,
    "Loan_Amount" numeric(15,2) NOT NULL,
    "Interest_Rate_Pct" numeric(5,2) NOT NULL,
    "Interest_Type" character varying(20) DEFAULT 'Monthly'::character varying,
    "Tenure_Months" integer DEFAULT 12,
    "Due_Date" date,
    "Interest_Paid_Upto_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Interest_Paid_Upto_Date" date,
    "Principal_Outstanding" numeric(15,2),
    "Status" character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    "Redeemed_Date" date,
    "Auctioned_Date" date,
    "Auction_Sale_Value" numeric(15,2),
    "Photo_URL" character varying(500),
    "ID_Proof_URL" character varying(1000),
    "Remarks" text,
    "Voucher_ID" character varying(50),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_By" character varying(50),
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_pawn_loan_header_Loan_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pawn_loan_header_Loan_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pawn_loan_header_Loan_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pawn_loan_header_Loan_ID_seq" OWNED BY public.tbl_pawn_loan_header."Loan_ID";


--
-- Name: tbl_pawn_loan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pawn_loan_items (
    "Item_ID" bigint NOT NULL,
    "Loan_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Item_Description" character varying(200) NOT NULL,
    "Type_ID" integer,
    "Gross_Weight" numeric(10,3) NOT NULL,
    "Net_Weight" numeric(10,3) NOT NULL,
    "Purity_Code" character varying(10),
    "Estimated_Value" numeric(15,2),
    "Item_Photo_URL" character varying(500),
    "Item_Status" character varying(20) DEFAULT 'Pledged'::character varying NOT NULL,
    "Returned_Date" date,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_pawn_loan_items_Item_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pawn_loan_items_Item_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pawn_loan_items_Item_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pawn_loan_items_Item_ID_seq" OWNED BY public.tbl_pawn_loan_items."Item_ID";


--
-- Name: tbl_pawn_loan_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pawn_loan_transactions (
    "Txn_ID" bigint NOT NULL,
    "Loan_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Txn_Type" character varying(20) NOT NULL,
    "Txn_Date" date NOT NULL,
    "Interest_Collected" numeric(15,2) DEFAULT '0'::numeric,
    "Principal_Collected" numeric(15,2) DEFAULT '0'::numeric,
    "Total_Amount" numeric(15,2) NOT NULL,
    "Balance_Due" numeric(15,2),
    "Payment_Mode" character varying(20),
    "Receipt_Number" character varying(30),
    "Remarks" text,
    "Voucher_ID" character varying(50),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_pawn_loan_transactions_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pawn_loan_transactions_Txn_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pawn_loan_transactions_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pawn_loan_transactions_Txn_ID_seq" OWNED BY public.tbl_pawn_loan_transactions."Txn_ID";


--
-- Name: tbl_payment_gateway_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_payment_gateway_config (
    "Config_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Gateway" character varying(30) NOT NULL,
    "Key_ID" character varying(200),
    "Key_Secret" character varying(500),
    "Merchant_ID" character varying(200),
    "Salt_Key" character varying(500),
    "Salt_Index" character varying(10),
    "Environment" character varying(20) DEFAULT 'production'::character varying,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_payment_gateway_config_Config_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_payment_gateway_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_payment_gateway_config_Config_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_payment_gateway_config_Config_ID_seq" OWNED BY public.tbl_payment_gateway_config."Config_ID";


--
-- Name: tbl_payroll_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_payroll_details (
    "Detail_ID" bigint NOT NULL,
    "Run_ID" integer NOT NULL,
    "User_ID" integer,
    "Days_Present" integer DEFAULT 0,
    "Days_Absent" integer DEFAULT 0,
    "Gross_Salary" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "PF_Deduction" numeric(10,2) DEFAULT '0'::numeric,
    "ESI_Deduction" numeric(10,2) DEFAULT '0'::numeric,
    "Other_Deductions" numeric(10,2) DEFAULT '0'::numeric,
    "Incentive_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Net_Salary" numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "Payment_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Payment_Date" date,
    "Payment_Mode" character varying(20)
);


--
-- Name: tbl_payroll_details_Detail_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_payroll_details_Detail_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_payroll_details_Detail_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_payroll_details_Detail_ID_seq" OWNED BY public.tbl_payroll_details."Detail_ID";


--
-- Name: tbl_payroll_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_payroll_run (
    "Run_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Pay_Month" integer NOT NULL,
    "Pay_Year" integer NOT NULL,
    "Status" character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    "Generated_By" character varying(50),
    "Generated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Finalized_Date" timestamp with time zone,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_payroll_run_Run_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_payroll_run_Run_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_payroll_run_Run_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_payroll_run_Run_ID_seq" OWNED BY public.tbl_payroll_run."Run_ID";


--
-- Name: tbl_pg_order_track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pg_order_track (
    "Track_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Gateway" character varying(30) NOT NULL,
    "Order_ID" character varying(100),
    "Amount" numeric(15,2),
    "Currency" character varying(10) DEFAULT 'INR'::character varying,
    "Receipt" character varying(100),
    "Member_ID" integer,
    "Purpose" character varying(100),
    "Status" character varying(30) DEFAULT 'created'::character varying,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_pg_order_track_Track_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pg_order_track_Track_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pg_order_track_Track_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pg_order_track_Track_ID_seq" OWNED BY public.tbl_pg_order_track."Track_ID";


--
-- Name: tbl_pg_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_pg_transactions (
    "Txn_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Gateway" character varying(30) NOT NULL,
    "Order_ID" character varying(100),
    "Payment_ID" character varying(100),
    "Signature" character varying(300),
    "Amount" numeric(15,2) NOT NULL,
    "Currency" character varying(10) DEFAULT 'INR'::character varying,
    "Status" character varying(30) DEFAULT 'pending'::character varying,
    "Member_ID" integer,
    "Scheme_ID" integer,
    "Purpose" character varying(100),
    "Raw_Response" text,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_pg_transactions_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_pg_transactions_Txn_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_pg_transactions_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_pg_transactions_Txn_ID_seq" OWNED BY public.tbl_pg_transactions."Txn_ID";


--
-- Name: tbl_printer_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_printer_config (
    "Config_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Printer_Role" character varying(20) NOT NULL,
    "Printer_Name" character varying(150) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_printer_config_Config_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_printer_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_printer_config_Config_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_printer_config_Config_ID_seq" OWNED BY public.tbl_printer_config."Config_ID";


--
-- Name: tbl_product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_product_images (
    "Image_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Article_Number" character varying(50) NOT NULL,
    "Image_URL" text NOT NULL,
    "Thumbnail_URL" text,
    "Sort_Order" integer DEFAULT 0,
    "Is_Primary" boolean DEFAULT false,
    "Uploaded_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Ornament_ID" integer,
    "Image_Type" character varying(30) DEFAULT 'front'::character varying,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_product_images."Image_Type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_product_images."Image_Type" IS 'front|side|back|model|detail|other';


--
-- Name: tbl_product_images_Image_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_product_images_Image_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_product_images_Image_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_product_images_Image_ID_seq" OWNED BY public.tbl_product_images."Image_ID";


--
-- Name: tbl_production_department_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_production_department_master (
    "Dept_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Dept_Code" character varying(20) NOT NULL,
    "Dept_Name" character varying(100) NOT NULL,
    "Sequence_No" integer DEFAULT 0,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_production_department_master_Dept_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_production_department_master_Dept_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_production_department_master_Dept_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_production_department_master_Dept_ID_seq" OWNED BY public.tbl_production_department_master."Dept_ID";


--
-- Name: tbl_production_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_production_transaction (
    "Txn_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "BOM_ID" integer,
    "Dept_ID" integer,
    "Karigar_ID" integer,
    "Ornament_ID" bigint,
    "Txn_Date" date NOT NULL,
    "Input_Weight" numeric(10,3) NOT NULL,
    "Output_Weight" numeric(10,3),
    "Wastage_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Wastage_Pct" numeric(5,2),
    "Labour_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'In Progress'::character varying,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_production_transaction_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_production_transaction_Txn_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_production_transaction_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_production_transaction_Txn_ID_seq" OWNED BY public.tbl_production_transaction."Txn_ID";


--
-- Name: tbl_purchase_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_purchase_details (
    "Detail_ID" bigint NOT NULL,
    "Purchase_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Ornament_ID" bigint,
    "Article_Number" character varying(50),
    "Type_ID" integer,
    "Item_Description" character varying(200),
    "Quantity" integer DEFAULT 1,
    "Gross_Weight" numeric(10,3),
    "Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Net_Weight" numeric(10,3),
    "Purity_Code" character varying(10),
    "Gold_Rate" numeric(10,2),
    "Making_Charge" numeric(10,2),
    "Stone_Value" numeric(10,2) DEFAULT '0'::numeric,
    "Purchase_Rate" numeric(15,2) NOT NULL,
    "Total_Line_Value" numeric(15,2) NOT NULL,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Net_Weight_Display" numeric(10,3),
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_purchase_details_Detail_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_purchase_details_Detail_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_purchase_details_Detail_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_purchase_details_Detail_ID_seq" OWNED BY public.tbl_purchase_details."Detail_ID";


--
-- Name: tbl_purchase_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_purchase_header (
    "Purchase_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Purchase_Number" character varying(30) NOT NULL,
    "Purchase_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Supplier_ID" integer,
    "Supplier_Name" character varying(100),
    "Supplier_Invoice_No" character varying(50),
    "Supplier_Invoice_Date" date,
    "Purchase_Type" character varying(20) DEFAULT 'Stock'::character varying,
    "Total_Gross_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Total_Net_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Subtotal_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "GST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Total_Amount" numeric(15,2) NOT NULL,
    "Amount_Paid" numeric(15,2) DEFAULT '0'::numeric,
    "Balance_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Payment_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Payment_Mode" character varying(20),
    "Status" character varying(20) DEFAULT 'Draft'::character varying,
    "Approved_By" character varying(50),
    "Approved_Date" timestamp with time zone,
    "Notes" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Bin_Source" character varying(20),
    "Bin_Voucher_ID" character varying(50),
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL,
    "CGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "SGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "IGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Is_Interstate" boolean DEFAULT false
);


--
-- Name: COLUMN tbl_purchase_header."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_purchase_header."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_purchase_header_Purchase_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_purchase_header_Purchase_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_purchase_header_Purchase_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_purchase_header_Purchase_ID_seq" OWNED BY public.tbl_purchase_header."Purchase_ID";


--
-- Name: tbl_purity_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_purity_master (
    "Purity_ID" integer NOT NULL,
    "Purity_Code" character varying(10) NOT NULL,
    "Karat" numeric(5,2) NOT NULL,
    "Percentage" numeric(5,2) NOT NULL,
    "Description" character varying(50),
    "Hallmark_Standard" character varying(20),
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_purity_master_Purity_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_purity_master_Purity_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_purity_master_Purity_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_purity_master_Purity_ID_seq" OWNED BY public.tbl_purity_master."Purity_ID";


--
-- Name: tbl_rate_booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_rate_booking (
    "Booking_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Booking_Number" character varying(30) NOT NULL,
    "Customer_ID" integer,
    "Booking_Date" date NOT NULL,
    "Metal_Type" character varying(20) NOT NULL,
    "Purity_Code" character varying(10),
    "Booked_Rate" numeric(10,2) NOT NULL,
    "Weight_Booked" numeric(10,3) NOT NULL,
    "Advance_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Valid_Until" date NOT NULL,
    "Status" character varying(20) DEFAULT 'Open'::character varying NOT NULL,
    "Utilized_Sale_ID" bigint,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_rate_booking_Booking_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_rate_booking_Booking_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_rate_booking_Booking_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_rate_booking_Booking_ID_seq" OWNED BY public.tbl_rate_booking."Booking_ID";


--
-- Name: tbl_reorder_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_reorder_request (
    "Request_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Type_ID" integer,
    "Design_ID" integer,
    "Requested_Qty" integer DEFAULT 1 NOT NULL,
    "Reason" character varying(200),
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Fulfilled_Purchase_ID" bigint,
    "Requested_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_reorder_request_Request_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_reorder_request_Request_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_reorder_request_Request_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_reorder_request_Request_ID_seq" OWNED BY public.tbl_reorder_request."Request_ID";


--
-- Name: tbl_repair_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_repair_orders (
    "Repair_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Job_Card_Number" character varying(30) NOT NULL,
    "Received_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Customer_ID" integer,
    "Customer_Name" character varying(100),
    "Customer_Mobile" character varying(15),
    "Item_Description" character varying(200) NOT NULL,
    "Item_Type" character varying(50),
    "Item_Weight" numeric(10,3),
    "Purity" character varying(10),
    "Repair_Work_Required" text,
    "Technician_Notes" text,
    "Assigned_Karigar_ID" integer,
    "Status" character varying(20) DEFAULT 'Received'::character varying,
    "Expected_Delivery" date,
    "Actual_Delivery" date,
    "Estimate_Amount" numeric(10,2),
    "Labour_Charge" numeric(10,2) DEFAULT '0'::numeric,
    "Material_Charge" numeric(10,2) DEFAULT '0'::numeric,
    "Total_Charge" numeric(10,2) DEFAULT '0'::numeric,
    "Advance_Paid" numeric(10,2) DEFAULT '0'::numeric,
    "Balance_Due" numeric(10,2) DEFAULT '0'::numeric,
    "Before_Image_URL" character varying(500),
    "After_Image_URL" character varying(500),
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_repair_orders_Repair_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_repair_orders_Repair_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_repair_orders_Repair_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_repair_orders_Repair_ID_seq" OWNED BY public.tbl_repair_orders."Repair_ID";


--
-- Name: tbl_return_from_karigar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_return_from_karigar (
    "Return_ID" bigint NOT NULL,
    "Issue_ID" bigint,
    "Tenant_ID" character varying(20) NOT NULL,
    "Return_Number" character varying(30) NOT NULL,
    "Return_Date" date NOT NULL,
    "Ornament_ID" bigint,
    "Gross_Weight_Returned" numeric(10,3) NOT NULL,
    "Net_Gold_Weight" numeric(10,3) NOT NULL,
    "Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Wastage_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Wastage_Percentage_Applied" numeric(5,2),
    "Gold_Rate_At_Return" numeric(10,2),
    "Total_Value_Returned" numeric(15,2),
    "Quality_Check_Passed" boolean DEFAULT true,
    "Quality_Remarks" text,
    "Rejection_Reason" character varying(200),
    "Status" character varying(20) DEFAULT 'Received'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_return_from_karigar_Return_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_return_from_karigar_Return_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_return_from_karigar_Return_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_return_from_karigar_Return_ID_seq" OWNED BY public.tbl_return_from_karigar."Return_ID";


--
-- Name: tbl_rfid_scan_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_rfid_scan_log (
    "Scan_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Ornament_ID" bigint,
    "RFID_Tag" character varying(100) NOT NULL,
    "Scan_Type" character varying(20) NOT NULL,
    "Scan_Location" character varying(100),
    "Scanned_By" character varying(50),
    "Scan_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_rfid_scan_log_Scan_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_rfid_scan_log_Scan_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_rfid_scan_log_Scan_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_rfid_scan_log_Scan_ID_seq" OWNED BY public.tbl_rfid_scan_log."Scan_ID";


--
-- Name: tbl_role_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_role_master (
    "Role_ID" integer NOT NULL,
    "Role_Name" character varying(50) NOT NULL,
    "Role_Description" text,
    "Permissions" jsonb,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Description" text,
    "Created_By" character varying(100),
    "Modified_Date" timestamp with time zone
);


--
-- Name: tbl_role_master_Role_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_role_master_Role_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_role_master_Role_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_role_master_Role_ID_seq" OWNED BY public.tbl_role_master."Role_ID";


--
-- Name: tbl_salary_structure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_salary_structure (
    "Structure_ID" integer NOT NULL,
    "User_ID" integer NOT NULL,
    "Basic" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    "HRA" numeric(10,2) DEFAULT '0'::numeric,
    "Conveyance" numeric(10,2) DEFAULT '0'::numeric,
    "Other_Allowance" numeric(10,2) DEFAULT '0'::numeric,
    "PF_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "ESI_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Effective_From" date NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_salary_structure_Structure_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_salary_structure_Structure_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_salary_structure_Structure_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_salary_structure_Structure_ID_seq" OWNED BY public.tbl_salary_structure."Structure_ID";


--
-- Name: tbl_sales_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sales_details (
    "Detail_ID" bigint NOT NULL,
    "Sale_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Ornament_ID" bigint,
    "Article_Number" character varying(50),
    "Item_Type_Name" character varying(50),
    "Quantity" integer DEFAULT 1,
    "Gross_Weight" numeric(10,3),
    "Net_Gold_Weight" numeric(10,3),
    "Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Purity_Code" character varying(10),
    "Gold_Rate_Per_Gram" numeric(10,2),
    "Making_Charge_Applied" numeric(10,2),
    "Wastage_Amount_Applied" numeric(10,2),
    "Discount_Percentage_Applied" numeric(5,2) DEFAULT '0'::numeric,
    "Discount_Amount_Applied" numeric(10,2) DEFAULT '0'::numeric,
    "Taxable_Value" numeric(15,2),
    "GST_Percentage_Applied" numeric(5,2) DEFAULT '3'::numeric,
    "GST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Total_Line_Price" numeric(15,2) NOT NULL,
    "Serial_No" integer,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Net_Weight_Display" numeric(10,3),
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_sales_details."Net_Weight_Display"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_sales_details."Net_Weight_Display" IS 'Gross minus stone weight for display';


--
-- Name: tbl_sales_details_Detail_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sales_details_Detail_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sales_details_Detail_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sales_details_Detail_ID_seq" OWNED BY public.tbl_sales_details."Detail_ID";


--
-- Name: tbl_sales_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sales_header (
    "Sale_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Invoice_Number" character varying(30) NOT NULL,
    "Sale_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Customer_ID" integer,
    "Customer_Name" character varying(100),
    "Customer_Mobile" character varying(15),
    "Total_Gross_Weight" numeric(10,3),
    "Total_Net_Gold_Weight" numeric(10,3),
    "Total_Stone_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Subtotal_Amount" numeric(15,2) NOT NULL,
    "Discount_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "GST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "GST_Percentage" numeric(5,2) DEFAULT '3'::numeric,
    "Round_Off_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Net_Payable_Amount" numeric(15,2) NOT NULL,
    "Payment_Mode" character varying(20),
    "Payment_Reference" character varying(50),
    "Payment_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Amount_Paid" numeric(15,2) DEFAULT '0'::numeric,
    "Balance_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Old_Gold_Exchange_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Old_Gold_Weight" numeric(10,3) DEFAULT '0'::numeric,
    "Is_Exchange" boolean DEFAULT false,
    "Sale_Type" character varying(20) DEFAULT 'Retail'::character varying,
    "Invoice_Type" character varying(20) DEFAULT 'Tax Invoice'::character varying,
    "GST_Invoice_No" character varying(50),
    "Delivery_Date" date,
    "Delivery_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Notes" text,
    "Counter_ID" integer,
    "Counter_Name" character varying(50),
    "Operator_Name" character varying(100),
    "PAN_Number" character varying(20),
    "PAN_Verified" boolean DEFAULT false,
    "Loyalty_Points_Used" numeric(10,2) DEFAULT '0'::numeric,
    "Loyalty_Points_Earned" numeric(10,2) DEFAULT '0'::numeric,
    "Voucher_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Scheme_Adjustment_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "HUID_Numbers" character varying(500),
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Voucher_ID" character varying(50),
    "Bonus_Adjustment_Amount" numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL,
    "CGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "SGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "IGST_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Is_Interstate" boolean DEFAULT false
);


--
-- Name: COLUMN tbl_sales_header."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_sales_header."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_sales_header_Sale_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sales_header_Sale_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sales_header_Sale_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sales_header_Sale_ID_seq" OWNED BY public.tbl_sales_header."Sale_ID";


--
-- Name: tbl_sales_incentive_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sales_incentive_transactions (
    "Txn_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Sale_ID" bigint NOT NULL,
    "User_ID" integer,
    "Slab_ID" integer,
    "Sale_Base_Amount" numeric(15,2) NOT NULL,
    "Incentive_Pct_Applied" numeric(5,2) NOT NULL,
    "Incentive_Amount" numeric(10,2) NOT NULL,
    "Payout_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Payroll_Run_ID" integer,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sales_incentive_transactions_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sales_incentive_transactions_Txn_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sales_incentive_transactions_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sales_incentive_transactions_Txn_ID_seq" OWNED BY public.tbl_sales_incentive_transactions."Txn_ID";


--
-- Name: tbl_sales_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sales_payments (
    "Payment_ID" bigint NOT NULL,
    "Sale_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Payment_Mode" character varying(30) NOT NULL,
    "Amount" numeric(15,2) NOT NULL,
    "Reference" character varying(100),
    "Bank_Name" character varying(100),
    "Cheque_Number" character varying(50),
    "Voucher_ID" integer,
    "Scheme_Enrollment_ID" bigint,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_sales_payments."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_sales_payments."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_sales_payments_Payment_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sales_payments_Payment_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sales_payments_Payment_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sales_payments_Payment_ID_seq" OWNED BY public.tbl_sales_payments."Payment_ID";


--
-- Name: tbl_saving_scheme_enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_saving_scheme_enrollment (
    "Enrollment_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Scheme_ID" integer,
    "Customer_ID" integer,
    "Enrollment_Number" character varying(30) NOT NULL,
    "Start_Date" date NOT NULL,
    "Maturity_Date" date,
    "Monthly_Amount" numeric(10,2) NOT NULL,
    "Installments_Paid" integer DEFAULT 0,
    "Total_Installments" integer NOT NULL,
    "Total_Amount_Paid" numeric(15,2) DEFAULT '0'::numeric,
    "Bonus_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Maturity_Value" numeric(15,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Redemption_Date" date,
    "Redemption_Sale_ID" bigint,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_saving_scheme_enrollment_Enrollment_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_saving_scheme_enrollment_Enrollment_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_saving_scheme_enrollment_Enrollment_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_saving_scheme_enrollment_Enrollment_ID_seq" OWNED BY public.tbl_saving_scheme_enrollment."Enrollment_ID";


--
-- Name: tbl_saving_scheme_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_saving_scheme_master (
    "Scheme_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Scheme_Code" character varying(20) NOT NULL,
    "Scheme_Name" character varying(100) NOT NULL,
    "Metal_Type" character varying(20) DEFAULT 'Gold'::character varying,
    "Duration_Months" integer NOT NULL,
    "Free_Months" integer DEFAULT 1,
    "Monthly_Amount" numeric(10,2) NOT NULL,
    "Bonus_Percent" numeric(5,2) DEFAULT '0'::numeric,
    "Terms" text,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_saving_scheme_master_Scheme_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_saving_scheme_master_Scheme_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_saving_scheme_master_Scheme_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_saving_scheme_master_Scheme_ID_seq" OWNED BY public.tbl_saving_scheme_master."Scheme_ID";


--
-- Name: tbl_scheme_accounting_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_accounting_entries (
    "Entry_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Txn_ID" integer,
    "Entry_Date" date NOT NULL,
    "Receipt_No" character varying(60),
    "Member_ID" integer,
    "Debit_Account" character varying(100) NOT NULL,
    "Credit_Account" character varying(100) NOT NULL,
    "Amount" numeric(15,2) NOT NULL,
    "Narration" text,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_accounting_entries_Entry_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_accounting_entries_Entry_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_accounting_entries_Entry_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_accounting_entries_Entry_ID_seq" OWNED BY public.tbl_scheme_accounting_entries."Entry_ID";


--
-- Name: tbl_scheme_bonuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_bonuses (
    "Bonus_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Member_ID" bigint,
    "Bonus_Type" character varying(30) NOT NULL,
    "Bonus_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Bonus_Gold_Grams" numeric(10,3) DEFAULT '0'::numeric,
    "Bonus_Product_Code" character varying(50),
    "Voucher_Code" character varying(50),
    "Credit_Date" date NOT NULL,
    "Is_Redeemed" boolean DEFAULT false,
    "Redemption_Date" date,
    "Notes" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_bonuses_Bonus_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_bonuses_Bonus_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_bonuses_Bonus_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_bonuses_Bonus_ID_seq" OWNED BY public.tbl_scheme_bonuses."Bonus_ID";


--
-- Name: tbl_scheme_draws; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_draws (
    "Draw_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Scheme_ID" integer,
    "Group_ID" integer,
    "Draw_Date" date NOT NULL,
    "Draw_Type" character varying(20) DEFAULT 'Monthly'::character varying,
    "Draw_Name" character varying(100),
    "Winner_Member_ID" bigint,
    "Prize_Type" character varying(30),
    "Prize_Value" numeric(10,2) DEFAULT '0'::numeric,
    "Prize_Description" character varying(200),
    "Eligible_Members" integer DEFAULT 0,
    "Notification_Sent" boolean DEFAULT false,
    "Conducted_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_draws_Draw_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_draws_Draw_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_draws_Draw_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_draws_Draw_ID_seq" OWNED BY public.tbl_scheme_draws."Draw_ID";


--
-- Name: tbl_scheme_gold_conversion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_gold_conversion (
    "Conversion_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Member_ID" bigint,
    "Conversion_Date" date NOT NULL,
    "Amount_Converted" numeric(10,2) NOT NULL,
    "Gold_Rate_Used" numeric(10,2) NOT NULL,
    "Gold_Weight_Credited" numeric(10,3) NOT NULL,
    "Remaining_Balance" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_Mode" character varying(20) DEFAULT 'Current Rate'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_gold_conversion_Conversion_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_gold_conversion_Conversion_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_gold_conversion_Conversion_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_gold_conversion_Conversion_ID_seq" OWNED BY public.tbl_scheme_gold_conversion."Conversion_ID";


--
-- Name: tbl_scheme_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_groups (
    "Group_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Scheme_ID" integer NOT NULL,
    "Group_Code" character varying(30) NOT NULL,
    "Group_Name" character varying(100) NOT NULL,
    "Start_Date" date NOT NULL,
    "End_Date" date,
    "Maturity_Date" date,
    "Monthly_Amount" numeric(10,2) NOT NULL,
    "Total_Installments" integer NOT NULL,
    "Member_Limit" integer DEFAULT 0,
    "Current_Members" integer DEFAULT 0,
    "App_Join_Allowed" boolean DEFAULT true,
    "Counter_Join_Allowed" boolean DEFAULT true,
    "Auto_Approval" boolean DEFAULT true,
    "Draw_Applicable" boolean DEFAULT false,
    "Gold_Conversion_Applicable" boolean DEFAULT true,
    "Bonus_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Group_Image_URL" character varying(500),
    "Group_Terms_Text" text,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_scheme_groups."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_scheme_groups."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_scheme_groups_Group_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_groups_Group_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_groups_Group_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_groups_Group_ID_seq" OWNED BY public.tbl_scheme_groups."Group_ID";


--
-- Name: tbl_scheme_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_installments (
    "Installment_ID" bigint NOT NULL,
    "Enrollment_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Installment_No" integer NOT NULL,
    "Due_Date" date NOT NULL,
    "Paid_Date" date,
    "Amount" numeric(10,2) NOT NULL,
    "Payment_Mode" character varying(20),
    "Receipt_Number" character varying(30),
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_installments_Installment_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_installments_Installment_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_installments_Installment_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_installments_Installment_ID_seq" OWNED BY public.tbl_scheme_installments."Installment_ID";


--
-- Name: tbl_scheme_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_master (
    "Scheme_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Scheme_Code" character varying(30) NOT NULL,
    "Scheme_Name" character varying(100) NOT NULL,
    "Description" text,
    "Scheme_Type" character varying(20) DEFAULT 'Gold'::character varying,
    "Collection_Frequency" character varying(20) DEFAULT 'Monthly'::character varying,
    "Installment_Mode" character varying(20) DEFAULT 'Fixed'::character varying,
    "Installment_Limit" character varying(20) DEFAULT 'No Limit'::character varying,
    "Default_Monthly_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Duration_Months" integer DEFAULT 11,
    "Free_Months" integer DEFAULT 1,
    "Bonus_Type" character varying(20) DEFAULT 'No Bonus'::character varying,
    "Bonus_Value" numeric(10,2) DEFAULT '0'::numeric,
    "Bonus_Product_Code" character varying(50),
    "Maturity_Type" character varying(30) DEFAULT 'Jewellery Purchase Only'::character varying,
    "Gold_Rate_Mode" character varying(20) DEFAULT 'Current Rate'::character varying,
    "Penalty_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Grace_Days" integer DEFAULT 7,
    "Enable_Gift" boolean DEFAULT false,
    "Gift_Value" numeric(10,2) DEFAULT '0'::numeric,
    "Enable_Draw" boolean DEFAULT false,
    "Draw_Frequency" character varying(20) DEFAULT 'Monthly'::character varying,
    "Show_In_App" boolean DEFAULT true,
    "Introducer_Incentive_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Salesman_Incentive_Pct" numeric(5,2) DEFAULT '0'::numeric,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_master_Scheme_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_master_Scheme_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_master_Scheme_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_master_Scheme_ID_seq" OWNED BY public.tbl_scheme_master."Scheme_ID";


--
-- Name: tbl_scheme_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_members (
    "Member_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Member_Number" character varying(30) NOT NULL,
    "Customer_ID" integer,
    "Member_Name" character varying(100) NOT NULL,
    "Father_Husband_Name" character varying(100),
    "DOB" date,
    "Anniversary" date,
    "Gender" character varying(10),
    "Mobile" character varying(15) NOT NULL,
    "WhatsApp" character varying(15),
    "Email" character varying(100),
    "Address_Line1" character varying(200),
    "Area" character varying(100),
    "City" character varying(50),
    "State" character varying(50),
    "Pincode" character varying(10),
    "PAN_No" character varying(20),
    "Aadhaar_No" character varying(20),
    "GST_No" character varying(20),
    "Nominee_Name" character varying(100),
    "Nominee_Relation" character varying(50),
    "Nominee_Mobile" character varying(15),
    "Scheme_ID" integer,
    "Group_ID" integer,
    "Joining_Date" date NOT NULL,
    "Installment_Amount" numeric(10,2) NOT NULL,
    "Installments_Paid" integer DEFAULT 0,
    "Total_Installments" integer NOT NULL,
    "Total_Amount_Paid" numeric(15,2) DEFAULT '0'::numeric,
    "Bonus_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Maturity_Value" numeric(15,2) DEFAULT '0'::numeric,
    "Maturity_Date" date,
    "Gold_Balance_Grams" numeric(10,3) DEFAULT '0'::numeric,
    "Introducer_Member_ID" bigint,
    "Salesman_User_ID" integer,
    "App_Login_Enabled" boolean DEFAULT false,
    "App_Device_ID" character varying(200),
    "App_Last_Login" timestamp with time zone,
    "App_FCM_Token" character varying(500),
    "KYC_Status" character varying(20) DEFAULT 'Pending'::character varying,
    "KYC_Aadhaar_URL" character varying(500),
    "KYC_PAN_URL" character varying(500),
    "KYC_Photo_URL" character varying(500),
    "Join_Source" character varying(20) DEFAULT 'Counter'::character varying,
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Redemption_Date" date,
    "Redemption_Sale_ID" bigint,
    "Closure_Reason" character varying(200),
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Amount_Redeemed" numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_scheme_members."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_scheme_members."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_scheme_members_Member_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_members_Member_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_members_Member_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_members_Member_ID_seq" OWNED BY public.tbl_scheme_members."Member_ID";


--
-- Name: tbl_scheme_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_notifications (
    "Notif_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Member_ID" bigint,
    "Type" character varying(20) NOT NULL,
    "Channel" character varying(20) NOT NULL,
    "Message" text NOT NULL,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Sent_At" timestamp with time zone,
    "Error_Message" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_notifications_Notif_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_notifications_Notif_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_notifications_Notif_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_notifications_Notif_ID_seq" OWNED BY public.tbl_scheme_notifications."Notif_ID";


--
-- Name: tbl_scheme_pdc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_pdc (
    "PDC_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Member_ID" bigint,
    "Bank_Name" character varying(100) NOT NULL,
    "Cheque_Number" character varying(50) NOT NULL,
    "Amount" numeric(10,2) NOT NULL,
    "Cheque_Date" date NOT NULL,
    "Deposit_Date" date,
    "Clearing_Date" date,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Bounce_Charge" numeric(10,2) DEFAULT '0'::numeric,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_pdc_PDC_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_pdc_PDC_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_pdc_PDC_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_pdc_PDC_ID_seq" OWNED BY public.tbl_scheme_pdc."PDC_ID";


--
-- Name: tbl_scheme_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_policies (
    "Policy_ID" integer NOT NULL,
    "Tenant_ID" character varying(20),
    "Policy_Type" character varying(20) NOT NULL,
    "Section_Title" character varying(200) NOT NULL,
    "Section_Content" text NOT NULL,
    "Sort_Order" integer DEFAULT 0,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_policies_Policy_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_policies_Policy_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_policies_Policy_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_policies_Policy_ID_seq" OWNED BY public.tbl_scheme_policies."Policy_ID";


--
-- Name: tbl_scheme_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_settings (
    "Setting_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Allow_Active_Scheme_Adjustment" boolean DEFAULT false NOT NULL,
    "Allow_Active_Scheme_Bonus" boolean DEFAULT false NOT NULL,
    "Updated_By" character varying(50),
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_scheme_settings_Setting_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_settings_Setting_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_settings_Setting_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_settings_Setting_ID_seq" OWNED BY public.tbl_scheme_settings."Setting_ID";


--
-- Name: tbl_scheme_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_scheme_transactions (
    "Txn_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Receipt_Number" character varying(30) NOT NULL,
    "Member_ID" bigint,
    "Tenant_Member_No" character varying(30),
    "Txn_Type" character varying(20) DEFAULT 'Collection'::character varying,
    "Installment_No" integer NOT NULL,
    "Due_Date" date,
    "Payment_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Amount" numeric(10,2) NOT NULL,
    "Penalty_Amount" numeric(10,2) DEFAULT '0'::numeric,
    "Net_Amount" numeric(10,2) NOT NULL,
    "Payment_Mode" character varying(30) NOT NULL,
    "Payment_Reference" character varying(100),
    "Bank_Name" character varying(100),
    "Cheque_Number" character varying(50),
    "Cheque_Date" date,
    "Collection_Source" character varying(20) DEFAULT 'Counter'::character varying,
    "Collected_By" integer,
    "Branch_ID" character varying(20),
    "Is_Late" boolean DEFAULT false,
    "Days_Late" integer DEFAULT 0,
    "Notification_Sent" boolean DEFAULT false,
    "Notes" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Agent_Code" character varying(30),
    "Installment_Number" integer,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_scheme_transactions."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_scheme_transactions."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_scheme_transactions_Txn_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_scheme_transactions_Txn_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_scheme_transactions_Txn_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_scheme_transactions_Txn_ID_seq" OWNED BY public.tbl_scheme_transactions."Txn_ID";


--
-- Name: tbl_session_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_session_master (
    "Session_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "User_ID" integer,
    "Branch_ID" character varying(20),
    "Current_Active_Cart_ID" bigint,
    "Is_Customer_Screen_Open" boolean DEFAULT false,
    "Customer_Screen_Session_ID" character varying(50),
    "Session_Start" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Last_Activity" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Session_End" timestamp with time zone,
    "Is_Active" boolean DEFAULT true,
    "IP_Address" character varying(50),
    "Device_Info" text,
    "Counter_ID" integer,
    "Counter_Name" character varying(50),
    "Counter_Window_ID" character varying(50),
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sms_gateway_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sms_gateway_config (
    "Config_ID" integer NOT NULL,
    "Tenant_ID" character varying(20),
    "Provider" character varying(30) DEFAULT 'asterix'::character varying NOT NULL,
    "Api_Base_Url" character varying(255) NOT NULL,
    "Api_User" character varying(100) NOT NULL,
    "Api_Key" character varying(150) NOT NULL,
    "Sender_Id" character varying(20) NOT NULL,
    "Entity_Id" character varying(50) NOT NULL,
    "Account_Usage" character varying(10) DEFAULT '1'::character varying,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sms_gateway_config_Config_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sms_gateway_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sms_gateway_config_Config_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sms_gateway_config_Config_ID_seq" OWNED BY public.tbl_sms_gateway_config."Config_ID";


--
-- Name: tbl_sms_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sms_log (
    "Log_ID" integer NOT NULL,
    "Tenant_ID" character varying(20),
    "Mobile" character varying(15) NOT NULL,
    "Purpose" character varying(30) NOT NULL,
    "Message" text NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Provider_Response" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sms_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sms_log_Log_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sms_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sms_log_Log_ID_seq" OWNED BY public.tbl_sms_log."Log_ID";


--
-- Name: tbl_sms_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sms_templates (
    "Template_ID" integer NOT NULL,
    "Tenant_ID" character varying(20),
    "Purpose" character varying(30) NOT NULL,
    "Dlt_Template_Id" character varying(50) NOT NULL,
    "Template_Text" text NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sms_templates_Template_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sms_templates_Template_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sms_templates_Template_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sms_templates_Template_ID_seq" OWNED BY public.tbl_sms_templates."Template_ID";


--
-- Name: tbl_stock_transfer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_stock_transfer (
    "Transfer_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Transfer_Number" character varying(30) NOT NULL,
    "Transfer_Type" character varying(20) NOT NULL,
    "Transfer_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "From_Branch_ID" character varying(20),
    "From_Floor_ID" integer,
    "From_Counter_ID" integer,
    "To_Branch_ID" character varying(20),
    "To_Floor_ID" integer,
    "To_Counter_ID" integer,
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Approved_By" character varying(50),
    "Approved_Date" timestamp with time zone,
    "Remarks" text,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL,
    "From_Tray_ID" integer,
    "To_Tray_ID" integer,
    "To_Hidden_Location_ID" integer,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_stock_transfer."Data_Mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_stock_transfer."Data_Mode" IS '1=Dummy, 2=Unofficial, 3=Official';


--
-- Name: tbl_stock_transfer_Transfer_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_stock_transfer_Transfer_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_stock_transfer_Transfer_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_stock_transfer_Transfer_ID_seq" OWNED BY public.tbl_stock_transfer."Transfer_ID";


--
-- Name: tbl_stock_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_stock_transfer_items (
    "Item_ID" bigint NOT NULL,
    "Transfer_ID" bigint NOT NULL,
    "Ornament_ID" bigint,
    "Article_Number" character varying(50),
    "Gross_Weight" numeric(10,3),
    "Status" character varying(20) DEFAULT 'Pending'::character varying,
    "Remarks" text
);


--
-- Name: tbl_stock_transfer_items_Item_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_stock_transfer_items_Item_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_stock_transfer_items_Item_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_stock_transfer_items_Item_ID_seq" OWNED BY public.tbl_stock_transfer_items."Item_ID";


--
-- Name: tbl_sub_category_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sub_category_master (
    "SubCat_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Type_ID" integer,
    "SubCat_Code" character varying(30) NOT NULL,
    "SubCat_Name" character varying(100) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_sub_category_master_SubCat_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sub_category_master_SubCat_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sub_category_master_SubCat_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sub_category_master_SubCat_ID_seq" OWNED BY public.tbl_sub_category_master."SubCat_ID";


--
-- Name: tbl_subscription_plan_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_subscription_plan_master (
    "Plan_ID" integer NOT NULL,
    "Plan_Name" character varying(50) NOT NULL,
    "Monthly_Price" numeric(10,2) DEFAULT '0'::numeric,
    "Annual_Price" numeric(10,2) DEFAULT '0'::numeric,
    "Max_Users" integer DEFAULT 5,
    "Max_Branches" integer DEFAULT 1,
    "Max_Devices" integer DEFAULT 5,
    "Features_JSON" jsonb,
    "Is_Active" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_subscription_plan_master_Plan_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_subscription_plan_master_Plan_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_subscription_plan_master_Plan_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_subscription_plan_master_Plan_ID_seq" OWNED BY public.tbl_subscription_plan_master."Plan_ID";


--
-- Name: tbl_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sync_log (
    "Log_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Device_ID" character varying(50),
    "Table_Name" character varying(60) NOT NULL,
    "Record_Sync_UUID" uuid,
    "Direction" character varying(20) NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Conflict_Resolution" character varying(20),
    "Error_Message" text,
    "Synced_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_sync_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sync_log_Log_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sync_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sync_log_Log_ID_seq" OWNED BY public.tbl_sync_log."Log_ID";


--
-- Name: tbl_sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_sync_queue (
    "Queue_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20),
    "Device_ID" character varying(50) NOT NULL,
    "Table_Name" character varying(60) NOT NULL,
    "Record_ID" bigint NOT NULL,
    "Record_Sync_UUID" uuid NOT NULL,
    "Operation" character varying(10) NOT NULL,
    "Payload" jsonb,
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Retry_Count" integer DEFAULT 0,
    "Error_Message" text,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Synced_Date" timestamp with time zone
);


--
-- Name: tbl_sync_queue_Queue_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_sync_queue_Queue_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_sync_queue_Queue_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_sync_queue_Queue_ID_seq" OWNED BY public.tbl_sync_queue."Queue_ID";


--
-- Name: tbl_system_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_system_setting (
    "Setting_Key" character varying(100) NOT NULL,
    "Setting_Value" text,
    "Description" character varying(300),
    "Updated_By" character varying(50),
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_tally_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tally_config (
    "Config_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Tally_Company_Name" character varying(100),
    "Tally_Company_GUID" character varying(100),
    "Sync_Enabled" boolean DEFAULT false,
    "Sync_Direction" character varying(20) DEFAULT 'Export Only'::character varying,
    "Server_IP" character varying(50),
    "Server_Port" integer DEFAULT 9000,
    "Mapping_JSON" jsonb,
    "Last_Sync_Date" timestamp with time zone,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tally_config_Config_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tally_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tally_config_Config_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tally_config_Config_ID_seq" OWNED BY public.tbl_tally_config."Config_ID";


--
-- Name: tbl_tally_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tally_sync_log (
    "Log_ID" bigint NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Sync_Type" character varying(20) NOT NULL,
    "Reference_Table" character varying(60),
    "Reference_ID" bigint,
    "Tally_Voucher_GUID" character varying(100),
    "Status" character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    "Error_Message" text,
    "Synced_Date" timestamp with time zone,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tally_sync_log_Log_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tally_sync_log_Log_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tally_sync_log_Log_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tally_sync_log_Log_ID_seq" OWNED BY public.tbl_tally_sync_log."Log_ID";


--
-- Name: tbl_tenant_app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_app_config (
    "Config_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Theme_ID" integer DEFAULT 1,
    "App_Package" character varying(100),
    "Apple_App_ID" character varying(30),
    "Play_Store_URL" character varying(300),
    "App_Store_URL" character varying(300),
    "Primary_Color" character varying(20) DEFAULT '#B8860B'::character varying,
    "Secondary_Color" character varying(20) DEFAULT '#FFD700'::character varying,
    "Logo_URL" character varying(500),
    "Terms_And_Conditions" text,
    "Privacy_Policy" text,
    "Support_Mobile" character varying(20),
    "Support_Email" character varying(100),
    "Enable_Digi_Gold" boolean DEFAULT true,
    "Enable_OTP_LOGIN" boolean DEFAULT true,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tenant_app_config_Config_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tenant_app_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tenant_app_config_Config_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tenant_app_config_Config_ID_seq" OWNED BY public.tbl_tenant_app_config."Config_ID";


--
-- Name: tbl_tenant_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_master (
    "Tenant_ID" character varying(20) NOT NULL,
    "Company_Name" character varying(100) NOT NULL,
    "Brand_Code" character varying(10) NOT NULL,
    "Registration_No" character varying(50),
    "GST_No" character varying(20),
    "PAN_No" character varying(20),
    "Address_Line1" character varying(200),
    "Address_Line2" character varying(200),
    "City" character varying(50),
    "State" character varying(50),
    "Pincode" character varying(10),
    "Country" character varying(50) DEFAULT 'India'::character varying,
    "Phone" character varying(20),
    "Email" character varying(100),
    "Website" character varying(100),
    "License_Key" character varying(50) NOT NULL,
    "Is_Active" boolean DEFAULT true,
    "License_Expiry_Date" date NOT NULL,
    "Max_Users" integer DEFAULT 5,
    "Max_Branches" integer DEFAULT 1,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Created_By" character varying(50),
    "Notes" text,
    "Store_Type" character varying(20) DEFAULT 'Retailer'::character varying,
    "Today_Sales_Amount" numeric(15,2) DEFAULT '0'::numeric,
    "Today_Sales_Count" integer DEFAULT 0,
    "Stock_Value" numeric(15,2) DEFAULT '0'::numeric,
    "Active_User_Count" integer DEFAULT 0,
    "Last_Stats_Updated" timestamp with time zone,
    "Business_Type" character varying(30) DEFAULT 'HYBRID'::character varying NOT NULL,
    "DB_Host" character varying(255),
    "DB_Port" integer,
    "DB_Name" character varying(100),
    "DB_User" character varying(100),
    "DB_Password" character varying(255),
    "DB_SSL" boolean DEFAULT false,
    "DB_Provisioned_At" timestamp with time zone,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_tenant_master."Business_Type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_tenant_master."Business_Type" IS 'RETAILER | WHOLESALER | MANUFACTURER | HYBRID';


--
-- Name: tbl_tenant_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_modules (
    "TM_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Module_Key" character varying(50) NOT NULL,
    "Is_Enabled" boolean DEFAULT true,
    "Enabled_By" character varying(100),
    "Enabled_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tenant_modules_TM_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tenant_modules_TM_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tenant_modules_TM_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tenant_modules_TM_ID_seq" OWNED BY public.tbl_tenant_modules."TM_ID";


--
-- Name: tbl_tenant_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_rates (
    "Rate_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Rate_Date" date NOT NULL,
    "Rate_24K" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_22K" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_18K" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_14K" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_Silver_999" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_Silver_925" numeric(10,2) DEFAULT '0'::numeric,
    "Rate_Platinum" numeric(10,2) DEFAULT '0'::numeric,
    "Set_By" character varying(50),
    "Source" character varying(20) DEFAULT 'Manual'::character varying,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tenant_rates_Rate_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tenant_rates_Rate_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tenant_rates_Rate_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tenant_rates_Rate_ID_seq" OWNED BY public.tbl_tenant_rates."Rate_ID";


--
-- Name: tbl_tenant_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_subscription (
    "Subscription_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Plan_ID" integer,
    "Start_Date" date NOT NULL,
    "End_Date" date,
    "Billing_Cycle" character varying(10) DEFAULT 'Monthly'::character varying,
    "Status" character varying(20) DEFAULT 'Active'::character varying NOT NULL,
    "Grace_Period_Days" integer DEFAULT 7,
    "Last_Payment_Date" date,
    "Last_Payment_Amount" numeric(10,2),
    "Payment_Reference" character varying(100),
    "Auto_Renew" boolean DEFAULT true,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_tenant_subscription_Subscription_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tenant_subscription_Subscription_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tenant_subscription_Subscription_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tenant_subscription_Subscription_ID_seq" OWNED BY public.tbl_tenant_subscription."Subscription_ID";


--
-- Name: tbl_tenant_ui_theme; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tenant_ui_theme (
    "Tenant_ID" character varying(20) NOT NULL,
    "Font_Family" character varying(100) DEFAULT 'Inter'::character varying,
    "Font_Weight" integer DEFAULT 400,
    "Primary_Color" character varying(20) DEFAULT '#B8860B'::character varying,
    "Text_Case" character varying(20) DEFAULT 'none'::character varying,
    "Updated_By" character varying(50),
    "Updated_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Logo_URL" character varying(255),
    "Logo_Size" integer DEFAULT 100,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tray_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_tray_master (
    "Tray_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Branch_ID" character varying(20) NOT NULL,
    "Floor_ID" integer NOT NULL,
    "Counter_ID" integer NOT NULL,
    "Tray_Code" character varying(20) NOT NULL,
    "Tray_Name" character varying(100) NOT NULL,
    "Capacity" integer DEFAULT 20,
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_tray_master_Tray_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_tray_master_Tray_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_tray_master_Tray_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_tray_master_Tray_ID_seq" OWNED BY public.tbl_tray_master."Tray_ID";


--
-- Name: tbl_user_bin_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_bin_access (
    "Access_ID" bigint NOT NULL,
    "User_ID" integer NOT NULL,
    "Tray_ID" integer,
    "Hidden_Location_ID" integer,
    "Access_Level" character varying(20) DEFAULT 'View'::character varying,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_user_bin_access_Access_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_user_bin_access_Access_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_user_bin_access_Access_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_user_bin_access_Access_ID_seq" OWNED BY public.tbl_user_bin_access."Access_ID";


--
-- Name: tbl_user_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_master (
    "User_ID" integer NOT NULL,
    "Tenant_ID" character varying(20),
    "Username" character varying(50) NOT NULL,
    "Password_Hash" character varying(255) NOT NULL,
    "Password_Salt" character varying(50) NOT NULL,
    "Role_ID" integer,
    "Employee_ID" character varying(30),
    "Full_Name" character varying(100) NOT NULL,
    "Email" character varying(100),
    "Mobile" character varying(15),
    "Is_Active" boolean DEFAULT true,
    "Is_Admin" boolean DEFAULT false,
    "Last_Login_IP" character varying(50),
    "Last_Login_Date" timestamp with time zone,
    "Login_Attempts" integer DEFAULT 0,
    "Locked_Until" timestamp with time zone,
    "Can_Open_Customer_Display" boolean DEFAULT true,
    "Can_Edit_Invoice_Template" boolean DEFAULT false,
    "Can_Manage_Karigar" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Custom_Permissions" jsonb,
    "Employee_Code" character varying(30),
    "Department" character varying(100),
    "Branch_ID" character varying(50),
    "Default_Password" character varying(100),
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: COLUMN tbl_user_master."Custom_Permissions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_user_master."Custom_Permissions" IS 'User-specific permission overrides — takes precedence over role';


--
-- Name: COLUMN tbl_user_master."Default_Password"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tbl_user_master."Default_Password" IS 'Last-set plain-text password — visible to SA only for support purposes';


--
-- Name: tbl_user_master_User_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_user_master_User_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_user_master_User_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_user_master_User_ID_seq" OWNED BY public.tbl_user_master."User_ID";


--
-- Name: tbl_user_permission_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_user_permission_override (
    "Override_ID" bigint NOT NULL,
    "User_ID" integer NOT NULL,
    "Module_Key" character varying(50) NOT NULL,
    "Can_View" boolean DEFAULT true,
    "Can_Add" boolean DEFAULT false,
    "Can_Edit" boolean DEFAULT false,
    "Can_Delete" boolean DEFAULT false,
    "Can_Approve" boolean DEFAULT false,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tbl_user_permission_override_Override_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_user_permission_override_Override_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_user_permission_override_Override_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_user_permission_override_Override_ID_seq" OWNED BY public.tbl_user_permission_override."Override_ID";


--
-- Name: tbl_vendor_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_vendor_master (
    "Vendor_ID" integer NOT NULL,
    "Tenant_ID" character varying(20) NOT NULL,
    "Vendor_Type" character varying(20) NOT NULL,
    "Vendor_Code" character varying(30) NOT NULL,
    "Vendor_Name" character varying(100) NOT NULL,
    "Contact_Person" character varying(50),
    "Mobile_1" character varying(15) NOT NULL,
    "Mobile_2" character varying(15),
    "Email" character varying(100),
    "Address_Line1" character varying(200),
    "Address_Line2" character varying(200),
    "City" character varying(50),
    "State" character varying(50),
    "Pincode" character varying(10),
    "GST_No" character varying(20),
    "PAN_No" character varying(20),
    "Bank_Name" character varying(50),
    "Bank_Account_No" character varying(30),
    "IFSC_Code" character varying(20),
    "Opening_Balance" numeric(15,2) DEFAULT '0'::numeric,
    "Current_Balance" numeric(15,2) DEFAULT '0'::numeric,
    "Credit_Limit" numeric(15,2),
    "Credit_Days" integer DEFAULT 30,
    "Karigar_Skill" character varying(30),
    "Karigar_Experience_Years" integer,
    "Karigar_Daily_Capacity" integer,
    "Karigar_Wastage_Allowed_Percent" numeric(5,2),
    "Is_Active" boolean DEFAULT true,
    "Created_By" character varying(50),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Modified_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Notes" text,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_vendor_master_Vendor_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_vendor_master_Vendor_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_vendor_master_Vendor_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_vendor_master_Vendor_ID_seq" OWNED BY public.tbl_vendor_master."Vendor_ID";


--
-- Name: tbl_voucher_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tbl_voucher_master (
    "Voucher_PK" integer NOT NULL,
    "Voucher_ID" character varying(50) NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Voucher_Type" character varying(20) NOT NULL,
    "Reference_ID" integer,
    "Reference_Table" character varying(60),
    "Status" character varying(20) DEFAULT 'Active'::character varying,
    "Description" text,
    "Created_By" character varying(100),
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Sync_UUID" uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: tbl_voucher_master_Voucher_PK_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."tbl_voucher_master_Voucher_PK_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tbl_voucher_master_Voucher_PK_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."tbl_voucher_master_Voucher_PK_seq" OWNED BY public.tbl_voucher_master."Voucher_PK";


--
--



--
--



--
-- Name: tbl_accounting_entries Entry_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_entries ALTER COLUMN "Entry_ID" SET DEFAULT nextval('public."tbl_accounting_entries_Entry_ID_seq"'::regclass);


--
-- Name: tbl_accounting_journal Journal_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_journal ALTER COLUMN "Journal_ID" SET DEFAULT nextval('public."tbl_accounting_journal_Journal_ID_seq"'::regclass);


--
-- Name: tbl_agent_commission_transactions Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_commission_transactions ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_agent_commission_transactions_Txn_ID_seq"'::regclass);


--
-- Name: tbl_agent_master Agent_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_master ALTER COLUMN "Agent_ID" SET DEFAULT nextval('public."tbl_agent_master_Agent_ID_seq"'::regclass);


--
-- Name: tbl_amc_enrollment Enrollment_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment ALTER COLUMN "Enrollment_ID" SET DEFAULT nextval('public."tbl_amc_enrollment_Enrollment_ID_seq"'::regclass);


--
-- Name: tbl_amc_plan_master Plan_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_plan_master ALTER COLUMN "Plan_ID" SET DEFAULT nextval('public."tbl_amc_plan_master_Plan_ID_seq"'::regclass);


--
-- Name: tbl_app_version_master Version_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_app_version_master ALTER COLUMN "Version_ID" SET DEFAULT nextval('public."tbl_app_version_master_Version_ID_seq"'::regclass);


--
-- Name: tbl_approval_issue_header Issue_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header ALTER COLUMN "Issue_ID" SET DEFAULT nextval('public."tbl_approval_issue_header_Issue_ID_seq"'::regclass);


--
-- Name: tbl_approval_issue_items Issue_Item_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items ALTER COLUMN "Issue_Item_ID" SET DEFAULT nextval('public."tbl_approval_issue_items_Issue_Item_ID_seq"'::regclass);


--
-- Name: tbl_approval_party_master Party_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_party_master ALTER COLUMN "Party_ID" SET DEFAULT nextval('public."tbl_approval_party_master_Party_ID_seq"'::regclass);


--
-- Name: tbl_approval_receive_header Receive_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header ALTER COLUMN "Receive_ID" SET DEFAULT nextval('public."tbl_approval_receive_header_Receive_ID_seq"'::regclass);


--
-- Name: tbl_attendance Attendance_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance ALTER COLUMN "Attendance_ID" SET DEFAULT nextval('public."tbl_attendance_Attendance_ID_seq"'::regclass);


--
-- Name: tbl_audit_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_audit_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_audit_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_bank_account_master Account_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master ALTER COLUMN "Account_ID" SET DEFAULT nextval('public."tbl_bank_account_master_Account_ID_seq"'::regclass);


--
-- Name: tbl_bin_orders Order_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_orders ALTER COLUMN "Order_ID" SET DEFAULT nextval('public."tbl_bin_orders_Order_ID_seq"'::regclass);


--
-- Name: tbl_bin_purchase Bin_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_purchase ALTER COLUMN "Bin_ID" SET DEFAULT nextval('public."tbl_bin_purchase_Bin_ID_seq"'::regclass);


--
-- Name: tbl_bin_pure_gold Gold_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_pure_gold ALTER COLUMN "Gold_ID" SET DEFAULT nextval('public."tbl_bin_pure_gold_Gold_ID_seq"'::regclass);


--
-- Name: tbl_bin_sales_return Return_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_sales_return ALTER COLUMN "Return_ID" SET DEFAULT nextval('public."tbl_bin_sales_return_Return_ID_seq"'::regclass);


--
-- Name: tbl_bom_department_stages Stage_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_department_stages ALTER COLUMN "Stage_ID" SET DEFAULT nextval('public."tbl_bom_department_stages_Stage_ID_seq"'::regclass);


--
-- Name: tbl_bom_master BOM_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master ALTER COLUMN "BOM_ID" SET DEFAULT nextval('public."tbl_bom_master_BOM_ID_seq"'::regclass);


--
-- Name: tbl_brand_master Brand_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_master ALTER COLUMN "Brand_ID" SET DEFAULT nextval('public."tbl_brand_master_Brand_ID_seq"'::regclass);


--
-- Name: tbl_card_charges_master Charge_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_card_charges_master ALTER COLUMN "Charge_ID" SET DEFAULT nextval('public."tbl_card_charges_master_Charge_ID_seq"'::regclass);


--
-- Name: tbl_catalog_order_items Item_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_order_items ALTER COLUMN "Item_ID" SET DEFAULT nextval('public."tbl_catalog_order_items_Item_ID_seq"'::regclass);


--
-- Name: tbl_catalog_orders Order_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_orders ALTER COLUMN "Order_ID" SET DEFAULT nextval('public."tbl_catalog_orders_Order_ID_seq"'::regclass);


--
-- Name: tbl_catalog_wishlist Wishlist_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_wishlist ALTER COLUMN "Wishlist_ID" SET DEFAULT nextval('public."tbl_catalog_wishlist_Wishlist_ID_seq"'::regclass);


--
-- Name: tbl_chart_of_accounts Account_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts ALTER COLUMN "Account_ID" SET DEFAULT nextval('public."tbl_chart_of_accounts_Account_ID_seq"'::regclass);


--
-- Name: tbl_cheque_register Cheque_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_cheque_register ALTER COLUMN "Cheque_ID" SET DEFAULT nextval('public."tbl_cheque_register_Cheque_ID_seq"'::regclass);


--
-- Name: tbl_collection_master Collection_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_collection_master ALTER COLUMN "Collection_ID" SET DEFAULT nextval('public."tbl_collection_master_Collection_ID_seq"'::regclass);


--
-- Name: tbl_counter_master Counter_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master ALTER COLUMN "Counter_ID" SET DEFAULT nextval('public."tbl_counter_master_Counter_ID_seq"'::regclass);


--
-- Name: tbl_crm_followup Followup_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup ALTER COLUMN "Followup_ID" SET DEFAULT nextval('public."tbl_crm_followup_Followup_ID_seq"'::regclass);


--
-- Name: tbl_crm_lead Lead_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead ALTER COLUMN "Lead_ID" SET DEFAULT nextval('public."tbl_crm_lead_Lead_ID_seq"'::regclass);


--
-- Name: tbl_custom_order Order_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order ALTER COLUMN "Order_ID" SET DEFAULT nextval('public."tbl_custom_order_Order_ID_seq"'::regclass);


--
-- Name: tbl_customer_display_settings Setting_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_display_settings ALTER COLUMN "Setting_ID" SET DEFAULT nextval('public."tbl_customer_display_settings_Setting_ID_seq"'::regclass);


--
-- Name: tbl_customer_feedback Feedback_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback ALTER COLUMN "Feedback_ID" SET DEFAULT nextval('public."tbl_customer_feedback_Feedback_ID_seq"'::regclass);


--
-- Name: tbl_customer_insurance Insurance_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance ALTER COLUMN "Insurance_ID" SET DEFAULT nextval('public."tbl_customer_insurance_Insurance_ID_seq"'::regclass);


--
-- Name: tbl_customer_master Customer_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master ALTER COLUMN "Customer_ID" SET DEFAULT nextval('public."tbl_customer_master_Customer_ID_seq"'::regclass);


--
-- Name: tbl_day_close Close_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close ALTER COLUMN "Close_ID" SET DEFAULT nextval('public."tbl_day_close_Close_ID_seq"'::regclass);


--
-- Name: tbl_design_master Design_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_design_master ALTER COLUMN "Design_ID" SET DEFAULT nextval('public."tbl_design_master_Design_ID_seq"'::regclass);


--
-- Name: tbl_diamond_color_master Color_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_color_master ALTER COLUMN "Color_ID" SET DEFAULT nextval('public."tbl_diamond_color_master_Color_ID_seq"'::regclass);


--
-- Name: tbl_diamond_quality_master Quality_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_quality_master ALTER COLUMN "Quality_ID" SET DEFAULT nextval('public."tbl_diamond_quality_master_Quality_ID_seq"'::regclass);


--
-- Name: tbl_diamond_shape_master Shape_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_shape_master ALTER COLUMN "Shape_ID" SET DEFAULT nextval('public."tbl_diamond_shape_master_Shape_ID_seq"'::regclass);


--
-- Name: tbl_display_settings Setting_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_display_settings ALTER COLUMN "Setting_ID" SET DEFAULT nextval('public."tbl_display_settings_Setting_ID_seq"'::regclass);


--
-- Name: tbl_einvoice_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_einvoice_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_einvoice_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_erp_modules Module_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_erp_modules ALTER COLUMN "Module_ID" SET DEFAULT nextval('public."tbl_erp_modules_Module_ID_seq"'::regclass);


--
-- Name: tbl_floor_master Floor_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master ALTER COLUMN "Floor_ID" SET DEFAULT nextval('public."tbl_floor_master_Floor_ID_seq"'::regclass);


--
-- Name: tbl_gem_certificate Certificate_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate ALTER COLUMN "Certificate_ID" SET DEFAULT nextval('public."tbl_gem_certificate_Certificate_ID_seq"'::regclass);


--
-- Name: tbl_gemstone_master Stone_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gemstone_master ALTER COLUMN "Stone_ID" SET DEFAULT nextval('public."tbl_gemstone_master_Stone_ID_seq"'::regclass);


--
-- Name: tbl_gift_vouchers Voucher_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers ALTER COLUMN "Voucher_ID" SET DEFAULT nextval('public."tbl_gift_vouchers_Voucher_ID_seq"'::regclass);


--
-- Name: tbl_gold_rate_history Rate_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gold_rate_history ALTER COLUMN "Rate_ID" SET DEFAULT nextval('public."tbl_gold_rate_history_Rate_ID_seq"'::regclass);


--
-- Name: tbl_hidden_location_master Hidden_Location_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hidden_location_master ALTER COLUMN "Hidden_Location_ID" SET DEFAULT nextval('public."tbl_hidden_location_master_Hidden_Location_ID_seq"'::regclass);


--
-- Name: tbl_holiday_master Holiday_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master ALTER COLUMN "Holiday_ID" SET DEFAULT nextval('public."tbl_holiday_master_Holiday_ID_seq"'::regclass);


--
-- Name: tbl_hsn_master HSN_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hsn_master ALTER COLUMN "HSN_ID" SET DEFAULT nextval('public."tbl_hsn_master_HSN_ID_seq"'::regclass);


--
-- Name: tbl_huid_master HUID_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master ALTER COLUMN "HUID_ID" SET DEFAULT nextval('public."tbl_huid_master_HUID_ID_seq"'::regclass);


--
-- Name: tbl_incentive_slab_master Slab_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_incentive_slab_master ALTER COLUMN "Slab_ID" SET DEFAULT nextval('public."tbl_incentive_slab_master_Slab_ID_seq"'::regclass);


--
-- Name: tbl_insurance_policy_master Policy_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_insurance_policy_master ALTER COLUMN "Policy_ID" SET DEFAULT nextval('public."tbl_insurance_policy_master_Policy_ID_seq"'::regclass);


--
-- Name: tbl_invoice_preview_data Preview_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_preview_data ALTER COLUMN "Preview_ID" SET DEFAULT nextval('public."tbl_invoice_preview_data_Preview_ID_seq"'::regclass);


--
-- Name: tbl_invoice_studio_templates Template_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_studio_templates ALTER COLUMN "Template_ID" SET DEFAULT nextval('public."tbl_invoice_studio_templates_Template_ID_seq"'::regclass);


--
-- Name: tbl_invoice_template_master Template_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_template_master ALTER COLUMN "Template_ID" SET DEFAULT nextval('public."tbl_invoice_template_master_Template_ID_seq"'::regclass);


--
-- Name: tbl_issue_to_karigar Issue_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar ALTER COLUMN "Issue_ID" SET DEFAULT nextval('public."tbl_issue_to_karigar_Issue_ID_seq"'::regclass);


--
-- Name: tbl_item_type_master Type_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_item_type_master ALTER COLUMN "Type_ID" SET DEFAULT nextval('public."tbl_item_type_master_Type_ID_seq"'::regclass);


--
-- Name: tbl_license_master License_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_license_master ALTER COLUMN "License_ID" SET DEFAULT nextval('public."tbl_license_master_License_ID_seq"'::regclass);


--
-- Name: tbl_loyalty_points_slab Slab_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_points_slab ALTER COLUMN "Slab_ID" SET DEFAULT nextval('public."tbl_loyalty_points_slab_Slab_ID_seq"'::regclass);


--
-- Name: tbl_loyalty_transactions Loyalty_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions ALTER COLUMN "Loyalty_ID" SET DEFAULT nextval('public."tbl_loyalty_transactions_Loyalty_ID_seq"'::regclass);


--
-- Name: tbl_making_charge_master MC_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_making_charge_master ALTER COLUMN "MC_ID" SET DEFAULT nextval('public."tbl_making_charge_master_MC_ID_seq"'::regclass);


--
-- Name: tbl_melting_refining_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_melting_refining_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_mobile_otp OTP_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mobile_otp ALTER COLUMN "OTP_ID" SET DEFAULT nextval('public."tbl_mobile_otp_OTP_ID_seq"'::regclass);


--
-- Name: tbl_mould_bom_stock Mould_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mould_bom_stock ALTER COLUMN "Mould_ID" SET DEFAULT nextval('public."tbl_mould_bom_stock_Mould_ID_seq"'::regclass);


--
-- Name: tbl_non_tag_issue_header NTA_Issue_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header ALTER COLUMN "NTA_Issue_ID" SET DEFAULT nextval('public."tbl_non_tag_issue_header_NTA_Issue_ID_seq"'::regclass);


--
-- Name: tbl_non_tag_issue_items NTA_Issue_Item_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items ALTER COLUMN "NTA_Issue_Item_ID" SET DEFAULT nextval('public."tbl_non_tag_issue_items_NTA_Issue_Item_ID_seq"'::regclass);


--
-- Name: tbl_non_tag_receive_header NTA_Receive_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header ALTER COLUMN "NTA_Receive_ID" SET DEFAULT nextval('public."tbl_non_tag_receive_header_NTA_Receive_ID_seq"'::regclass);


--
-- Name: tbl_old_gold_exchange Exchange_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange ALTER COLUMN "Exchange_ID" SET DEFAULT nextval('public."tbl_old_gold_exchange_Exchange_ID_seq"'::regclass);


--
-- Name: tbl_ornament_master Ornament_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master ALTER COLUMN "Ornament_ID" SET DEFAULT nextval('public."tbl_ornament_master_Ornament_ID_seq"'::regclass);


--
-- Name: tbl_pawn_loan_guarantor Guarantor_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_guarantor ALTER COLUMN "Guarantor_ID" SET DEFAULT nextval('public."tbl_pawn_loan_guarantor_Guarantor_ID_seq"'::regclass);


--
-- Name: tbl_pawn_loan_header Loan_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header ALTER COLUMN "Loan_ID" SET DEFAULT nextval('public."tbl_pawn_loan_header_Loan_ID_seq"'::regclass);


--
-- Name: tbl_pawn_loan_items Item_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items ALTER COLUMN "Item_ID" SET DEFAULT nextval('public."tbl_pawn_loan_items_Item_ID_seq"'::regclass);


--
-- Name: tbl_pawn_loan_transactions Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_transactions ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_pawn_loan_transactions_Txn_ID_seq"'::regclass);


--
-- Name: tbl_payment_gateway_config Config_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payment_gateway_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_payment_gateway_config_Config_ID_seq"'::regclass);


--
-- Name: tbl_payroll_details Detail_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_details ALTER COLUMN "Detail_ID" SET DEFAULT nextval('public."tbl_payroll_details_Detail_ID_seq"'::regclass);


--
-- Name: tbl_payroll_run Run_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run ALTER COLUMN "Run_ID" SET DEFAULT nextval('public."tbl_payroll_run_Run_ID_seq"'::regclass);


--
-- Name: tbl_pg_order_track Track_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_order_track ALTER COLUMN "Track_ID" SET DEFAULT nextval('public."tbl_pg_order_track_Track_ID_seq"'::regclass);


--
-- Name: tbl_pg_transactions Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_transactions ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_pg_transactions_Txn_ID_seq"'::regclass);


--
-- Name: tbl_printer_config Config_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_printer_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_printer_config_Config_ID_seq"'::regclass);


--
-- Name: tbl_product_images Image_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_product_images ALTER COLUMN "Image_ID" SET DEFAULT nextval('public."tbl_product_images_Image_ID_seq"'::regclass);


--
-- Name: tbl_production_department_master Dept_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_department_master ALTER COLUMN "Dept_ID" SET DEFAULT nextval('public."tbl_production_department_master_Dept_ID_seq"'::regclass);


--
-- Name: tbl_production_transaction Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_production_transaction_Txn_ID_seq"'::regclass);


--
-- Name: tbl_purchase_details Detail_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details ALTER COLUMN "Detail_ID" SET DEFAULT nextval('public."tbl_purchase_details_Detail_ID_seq"'::regclass);


--
-- Name: tbl_purchase_header Purchase_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header ALTER COLUMN "Purchase_ID" SET DEFAULT nextval('public."tbl_purchase_header_Purchase_ID_seq"'::regclass);


--
-- Name: tbl_purity_master Purity_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purity_master ALTER COLUMN "Purity_ID" SET DEFAULT nextval('public."tbl_purity_master_Purity_ID_seq"'::regclass);


--
-- Name: tbl_rate_booking Booking_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking ALTER COLUMN "Booking_ID" SET DEFAULT nextval('public."tbl_rate_booking_Booking_ID_seq"'::regclass);


--
-- Name: tbl_reorder_request Request_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request ALTER COLUMN "Request_ID" SET DEFAULT nextval('public."tbl_reorder_request_Request_ID_seq"'::regclass);


--
-- Name: tbl_repair_orders Repair_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders ALTER COLUMN "Repair_ID" SET DEFAULT nextval('public."tbl_repair_orders_Repair_ID_seq"'::regclass);


--
-- Name: tbl_return_from_karigar Return_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar ALTER COLUMN "Return_ID" SET DEFAULT nextval('public."tbl_return_from_karigar_Return_ID_seq"'::regclass);


--
-- Name: tbl_rfid_scan_log Scan_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log ALTER COLUMN "Scan_ID" SET DEFAULT nextval('public."tbl_rfid_scan_log_Scan_ID_seq"'::regclass);


--
-- Name: tbl_role_master Role_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_master ALTER COLUMN "Role_ID" SET DEFAULT nextval('public."tbl_role_master_Role_ID_seq"'::regclass);


--
-- Name: tbl_salary_structure Structure_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_salary_structure ALTER COLUMN "Structure_ID" SET DEFAULT nextval('public."tbl_salary_structure_Structure_ID_seq"'::regclass);


--
-- Name: tbl_sales_details Detail_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_details ALTER COLUMN "Detail_ID" SET DEFAULT nextval('public."tbl_sales_details_Detail_ID_seq"'::regclass);


--
-- Name: tbl_sales_header Sale_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header ALTER COLUMN "Sale_ID" SET DEFAULT nextval('public."tbl_sales_header_Sale_ID_seq"'::regclass);


--
-- Name: tbl_sales_incentive_transactions Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_sales_incentive_transactions_Txn_ID_seq"'::regclass);


--
-- Name: tbl_sales_payments Payment_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_payments ALTER COLUMN "Payment_ID" SET DEFAULT nextval('public."tbl_sales_payments_Payment_ID_seq"'::regclass);


--
-- Name: tbl_saving_scheme_enrollment Enrollment_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment ALTER COLUMN "Enrollment_ID" SET DEFAULT nextval('public."tbl_saving_scheme_enrollment_Enrollment_ID_seq"'::regclass);


--
-- Name: tbl_saving_scheme_master Scheme_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_master ALTER COLUMN "Scheme_ID" SET DEFAULT nextval('public."tbl_saving_scheme_master_Scheme_ID_seq"'::regclass);


--
-- Name: tbl_scheme_accounting_entries Entry_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_accounting_entries ALTER COLUMN "Entry_ID" SET DEFAULT nextval('public."tbl_scheme_accounting_entries_Entry_ID_seq"'::regclass);


--
-- Name: tbl_scheme_bonuses Bonus_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_bonuses ALTER COLUMN "Bonus_ID" SET DEFAULT nextval('public."tbl_scheme_bonuses_Bonus_ID_seq"'::regclass);


--
-- Name: tbl_scheme_draws Draw_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws ALTER COLUMN "Draw_ID" SET DEFAULT nextval('public."tbl_scheme_draws_Draw_ID_seq"'::regclass);


--
-- Name: tbl_scheme_gold_conversion Conversion_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_gold_conversion ALTER COLUMN "Conversion_ID" SET DEFAULT nextval('public."tbl_scheme_gold_conversion_Conversion_ID_seq"'::regclass);


--
-- Name: tbl_scheme_groups Group_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups ALTER COLUMN "Group_ID" SET DEFAULT nextval('public."tbl_scheme_groups_Group_ID_seq"'::regclass);


--
-- Name: tbl_scheme_installments Installment_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_installments ALTER COLUMN "Installment_ID" SET DEFAULT nextval('public."tbl_scheme_installments_Installment_ID_seq"'::regclass);


--
-- Name: tbl_scheme_master Scheme_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_master ALTER COLUMN "Scheme_ID" SET DEFAULT nextval('public."tbl_scheme_master_Scheme_ID_seq"'::regclass);


--
-- Name: tbl_scheme_members Member_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members ALTER COLUMN "Member_ID" SET DEFAULT nextval('public."tbl_scheme_members_Member_ID_seq"'::regclass);


--
-- Name: tbl_scheme_notifications Notif_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_notifications ALTER COLUMN "Notif_ID" SET DEFAULT nextval('public."tbl_scheme_notifications_Notif_ID_seq"'::regclass);


--
-- Name: tbl_scheme_pdc PDC_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_pdc ALTER COLUMN "PDC_ID" SET DEFAULT nextval('public."tbl_scheme_pdc_PDC_ID_seq"'::regclass);


--
-- Name: tbl_scheme_policies Policy_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_policies ALTER COLUMN "Policy_ID" SET DEFAULT nextval('public."tbl_scheme_policies_Policy_ID_seq"'::regclass);


--
-- Name: tbl_scheme_settings Setting_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_settings ALTER COLUMN "Setting_ID" SET DEFAULT nextval('public."tbl_scheme_settings_Setting_ID_seq"'::regclass);


--
-- Name: tbl_scheme_transactions Txn_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions ALTER COLUMN "Txn_ID" SET DEFAULT nextval('public."tbl_scheme_transactions_Txn_ID_seq"'::regclass);


--
-- Name: tbl_sms_gateway_config Config_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_gateway_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_sms_gateway_config_Config_ID_seq"'::regclass);


--
-- Name: tbl_sms_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_sms_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_sms_templates Template_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_templates ALTER COLUMN "Template_ID" SET DEFAULT nextval('public."tbl_sms_templates_Template_ID_seq"'::regclass);


--
-- Name: tbl_stock_transfer Transfer_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer ALTER COLUMN "Transfer_ID" SET DEFAULT nextval('public."tbl_stock_transfer_Transfer_ID_seq"'::regclass);


--
-- Name: tbl_stock_transfer_items Item_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer_items ALTER COLUMN "Item_ID" SET DEFAULT nextval('public."tbl_stock_transfer_items_Item_ID_seq"'::regclass);


--
-- Name: tbl_sub_category_master SubCat_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master ALTER COLUMN "SubCat_ID" SET DEFAULT nextval('public."tbl_sub_category_master_SubCat_ID_seq"'::regclass);


--
-- Name: tbl_subscription_plan_master Plan_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_subscription_plan_master ALTER COLUMN "Plan_ID" SET DEFAULT nextval('public."tbl_subscription_plan_master_Plan_ID_seq"'::regclass);


--
-- Name: tbl_sync_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_sync_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_sync_queue Queue_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_queue ALTER COLUMN "Queue_ID" SET DEFAULT nextval('public."tbl_sync_queue_Queue_ID_seq"'::regclass);


--
-- Name: tbl_tally_config Config_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_tally_config_Config_ID_seq"'::regclass);


--
-- Name: tbl_tally_sync_log Log_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_sync_log ALTER COLUMN "Log_ID" SET DEFAULT nextval('public."tbl_tally_sync_log_Log_ID_seq"'::regclass);


--
-- Name: tbl_tenant_app_config Config_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_app_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_tenant_app_config_Config_ID_seq"'::regclass);


--
-- Name: tbl_tenant_modules TM_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_modules ALTER COLUMN "TM_ID" SET DEFAULT nextval('public."tbl_tenant_modules_TM_ID_seq"'::regclass);


--
-- Name: tbl_tenant_rates Rate_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_rates ALTER COLUMN "Rate_ID" SET DEFAULT nextval('public."tbl_tenant_rates_Rate_ID_seq"'::regclass);


--
-- Name: tbl_tenant_subscription Subscription_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_subscription ALTER COLUMN "Subscription_ID" SET DEFAULT nextval('public."tbl_tenant_subscription_Subscription_ID_seq"'::regclass);


--
-- Name: tbl_tray_master Tray_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master ALTER COLUMN "Tray_ID" SET DEFAULT nextval('public."tbl_tray_master_Tray_ID_seq"'::regclass);


--
-- Name: tbl_user_bin_access Access_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_bin_access ALTER COLUMN "Access_ID" SET DEFAULT nextval('public."tbl_user_bin_access_Access_ID_seq"'::regclass);


--
-- Name: tbl_user_master User_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master ALTER COLUMN "User_ID" SET DEFAULT nextval('public."tbl_user_master_User_ID_seq"'::regclass);


--
-- Name: tbl_user_permission_override Override_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_permission_override ALTER COLUMN "Override_ID" SET DEFAULT nextval('public."tbl_user_permission_override_Override_ID_seq"'::regclass);


--
-- Name: tbl_vendor_master Vendor_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_vendor_master ALTER COLUMN "Vendor_ID" SET DEFAULT nextval('public."tbl_vendor_master_Vendor_ID_seq"'::regclass);


--
-- Name: tbl_voucher_master Voucher_PK; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_voucher_master ALTER COLUMN "Voucher_PK" SET DEFAULT nextval('public."tbl_voucher_master_Voucher_PK_seq"'::regclass);


--
--



--
--



--
-- Name: tbl_accounting_entries tbl_accounting_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_pkey PRIMARY KEY ("Entry_ID");


--
-- Name: tbl_accounting_entries tbl_accounting_entries_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_accounting_journal tbl_accounting_journal_journal_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_journal
    ADD CONSTRAINT tbl_accounting_journal_journal_number_unique UNIQUE ("Journal_Number");


--
-- Name: tbl_accounting_journal tbl_accounting_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_journal
    ADD CONSTRAINT tbl_accounting_journal_pkey PRIMARY KEY ("Journal_ID");


--
-- Name: tbl_accounting_journal tbl_accounting_journal_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_journal
    ADD CONSTRAINT tbl_accounting_journal_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_agent_commission_transactions tbl_agent_commission_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_commission_transactions
    ADD CONSTRAINT tbl_agent_commission_transactions_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_agent_commission_transactions tbl_agent_commission_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_commission_transactions
    ADD CONSTRAINT tbl_agent_commission_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_agent_master tbl_agent_master_agent_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_agent_code_unique UNIQUE ("Agent_Code");


--
-- Name: tbl_agent_master tbl_agent_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_pkey PRIMARY KEY ("Agent_ID");


--
-- Name: tbl_agent_master tbl_agent_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_agent_master tbl_agent_master_tenant_id_mobile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_tenant_id_mobile_unique UNIQUE ("Tenant_ID", "Mobile");


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_pkey PRIMARY KEY ("Enrollment_ID");


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_amc_plan_master tbl_amc_plan_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_plan_master
    ADD CONSTRAINT tbl_amc_plan_master_pkey PRIMARY KEY ("Plan_ID");


--
-- Name: tbl_amc_plan_master tbl_amc_plan_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_plan_master
    ADD CONSTRAINT tbl_amc_plan_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_app_version_master tbl_app_version_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_app_version_master
    ADD CONSTRAINT tbl_app_version_master_pkey PRIMARY KEY ("Version_ID");


--
-- Name: tbl_app_version_master tbl_app_version_master_platform_version_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_app_version_master
    ADD CONSTRAINT tbl_app_version_master_platform_version_number_unique UNIQUE ("Platform", "Version_Number");


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_pkey PRIMARY KEY ("Issue_ID");


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_voucher_number_unique UNIQUE ("Voucher_Number");


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_pkey PRIMARY KEY ("Issue_Item_ID");


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_approval_party_master tbl_approval_party_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_party_master
    ADD CONSTRAINT tbl_approval_party_master_pkey PRIMARY KEY ("Party_ID");


--
-- Name: tbl_approval_party_master tbl_approval_party_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_party_master
    ADD CONSTRAINT tbl_approval_party_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_approval_party_master tbl_approval_party_master_tenant_id_mobile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_party_master
    ADD CONSTRAINT tbl_approval_party_master_tenant_id_mobile_unique UNIQUE ("Tenant_ID", "Mobile");


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_pkey PRIMARY KEY ("Receive_ID");


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_voucher_number_unique UNIQUE ("Voucher_Number");


--
-- Name: tbl_attendance tbl_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance
    ADD CONSTRAINT tbl_attendance_pkey PRIMARY KEY ("Attendance_ID");


--
-- Name: tbl_attendance tbl_attendance_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance
    ADD CONSTRAINT tbl_attendance_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_attendance tbl_attendance_user_id_attendance_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance
    ADD CONSTRAINT tbl_attendance_user_id_attendance_date_unique UNIQUE ("User_ID", "Attendance_Date");


--
-- Name: tbl_audit_log tbl_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_audit_log
    ADD CONSTRAINT tbl_audit_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_audit_log tbl_audit_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_audit_log
    ADD CONSTRAINT tbl_audit_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bank_account_master tbl_bank_account_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master
    ADD CONSTRAINT tbl_bank_account_master_pkey PRIMARY KEY ("Account_ID");


--
-- Name: tbl_bank_account_master tbl_bank_account_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master
    ADD CONSTRAINT tbl_bank_account_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bank_account_master tbl_bank_account_master_tenant_id_account_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master
    ADD CONSTRAINT tbl_bank_account_master_tenant_id_account_number_unique UNIQUE ("Tenant_ID", "Account_Number");


--
-- Name: tbl_bin_orders tbl_bin_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_orders
    ADD CONSTRAINT tbl_bin_orders_pkey PRIMARY KEY ("Order_ID");


--
-- Name: tbl_bin_orders tbl_bin_orders_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_orders
    ADD CONSTRAINT tbl_bin_orders_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bin_orders tbl_bin_orders_voucher_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_orders
    ADD CONSTRAINT tbl_bin_orders_voucher_id_unique UNIQUE ("Voucher_ID");


--
-- Name: tbl_bin_purchase tbl_bin_purchase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_purchase
    ADD CONSTRAINT tbl_bin_purchase_pkey PRIMARY KEY ("Bin_ID");


--
-- Name: tbl_bin_purchase tbl_bin_purchase_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_purchase
    ADD CONSTRAINT tbl_bin_purchase_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bin_purchase tbl_bin_purchase_voucher_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_purchase
    ADD CONSTRAINT tbl_bin_purchase_voucher_id_unique UNIQUE ("Voucher_ID");


--
-- Name: tbl_bin_pure_gold tbl_bin_pure_gold_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_pure_gold
    ADD CONSTRAINT tbl_bin_pure_gold_pkey PRIMARY KEY ("Gold_ID");


--
-- Name: tbl_bin_pure_gold tbl_bin_pure_gold_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_pure_gold
    ADD CONSTRAINT tbl_bin_pure_gold_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bin_pure_gold tbl_bin_pure_gold_voucher_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_pure_gold
    ADD CONSTRAINT tbl_bin_pure_gold_voucher_id_unique UNIQUE ("Voucher_ID");


--
-- Name: tbl_bin_sales_return tbl_bin_sales_return_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_sales_return
    ADD CONSTRAINT tbl_bin_sales_return_pkey PRIMARY KEY ("Return_ID");


--
-- Name: tbl_bin_sales_return tbl_bin_sales_return_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_sales_return
    ADD CONSTRAINT tbl_bin_sales_return_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_bin_sales_return tbl_bin_sales_return_voucher_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bin_sales_return
    ADD CONSTRAINT tbl_bin_sales_return_voucher_id_unique UNIQUE ("Voucher_ID");


--
-- Name: tbl_bom_department_stages tbl_bom_department_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_department_stages
    ADD CONSTRAINT tbl_bom_department_stages_pkey PRIMARY KEY ("Stage_ID");


--
-- Name: tbl_bom_master tbl_bom_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master
    ADD CONSTRAINT tbl_bom_master_pkey PRIMARY KEY ("BOM_ID");


--
-- Name: tbl_bom_master tbl_bom_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master
    ADD CONSTRAINT tbl_bom_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_branch_master tbl_branch_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_branch_master
    ADD CONSTRAINT tbl_branch_master_pkey PRIMARY KEY ("Branch_ID");


--
-- Name: tbl_branch_master tbl_branch_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_branch_master
    ADD CONSTRAINT tbl_branch_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_brand_master tbl_brand_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_master
    ADD CONSTRAINT tbl_brand_master_pkey PRIMARY KEY ("Brand_ID");


--
-- Name: tbl_brand_master tbl_brand_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_master
    ADD CONSTRAINT tbl_brand_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_brand_master tbl_brand_master_tenant_id_brand_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_master
    ADD CONSTRAINT tbl_brand_master_tenant_id_brand_code_unique UNIQUE ("Tenant_ID", "Brand_Code");


--
-- Name: tbl_card_charges_master tbl_card_charges_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_card_charges_master
    ADD CONSTRAINT tbl_card_charges_master_pkey PRIMARY KEY ("Charge_ID");


--
-- Name: tbl_card_charges_master tbl_card_charges_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_card_charges_master
    ADD CONSTRAINT tbl_card_charges_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_catalog_order_items tbl_catalog_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_order_items
    ADD CONSTRAINT tbl_catalog_order_items_pkey PRIMARY KEY ("Item_ID");


--
-- Name: tbl_catalog_orders tbl_catalog_orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_orders
    ADD CONSTRAINT tbl_catalog_orders_order_number_unique UNIQUE ("Order_Number");


--
-- Name: tbl_catalog_orders tbl_catalog_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_orders
    ADD CONSTRAINT tbl_catalog_orders_pkey PRIMARY KEY ("Order_ID");


--
-- Name: tbl_catalog_orders tbl_catalog_orders_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_orders
    ADD CONSTRAINT tbl_catalog_orders_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_catalog_wishlist tbl_catalog_wishlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_pkey PRIMARY KEY ("Wishlist_ID");


--
-- Name: tbl_catalog_wishlist tbl_catalog_wishlist_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_catalog_wishlist tbl_catalog_wishlist_tenant_id_article_number_customer_mobile_u; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_tenant_id_article_number_customer_mobile_u UNIQUE ("Tenant_ID", "Article_Number", "Customer_Mobile");


--
-- Name: tbl_chart_of_accounts tbl_chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts
    ADD CONSTRAINT tbl_chart_of_accounts_pkey PRIMARY KEY ("Account_ID");


--
-- Name: tbl_chart_of_accounts tbl_chart_of_accounts_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts
    ADD CONSTRAINT tbl_chart_of_accounts_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_chart_of_accounts tbl_chart_of_accounts_tenant_id_account_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts
    ADD CONSTRAINT tbl_chart_of_accounts_tenant_id_account_name_unique UNIQUE ("Tenant_ID", "Account_Name");


--
-- Name: tbl_cheque_register tbl_cheque_register_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_cheque_register
    ADD CONSTRAINT tbl_cheque_register_pkey PRIMARY KEY ("Cheque_ID");


--
-- Name: tbl_cheque_register tbl_cheque_register_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_cheque_register
    ADD CONSTRAINT tbl_cheque_register_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_collection_master tbl_collection_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_collection_master
    ADD CONSTRAINT tbl_collection_master_pkey PRIMARY KEY ("Collection_ID");


--
-- Name: tbl_collection_master tbl_collection_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_collection_master
    ADD CONSTRAINT tbl_collection_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_collection_master tbl_collection_master_tenant_id_collection_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_collection_master
    ADD CONSTRAINT tbl_collection_master_tenant_id_collection_code_unique UNIQUE ("Tenant_ID", "Collection_Code");


--
-- Name: tbl_counter_master tbl_counter_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_pkey PRIMARY KEY ("Counter_ID");


--
-- Name: tbl_counter_master tbl_counter_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_counter_master tbl_counter_master_tenant_id_branch_id_floor_id_counter_code_un; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_tenant_id_branch_id_floor_id_counter_code_un UNIQUE ("Tenant_ID", "Branch_ID", "Floor_ID", "Counter_Code");


--
-- Name: tbl_crm_followup tbl_crm_followup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_pkey PRIMARY KEY ("Followup_ID");


--
-- Name: tbl_crm_followup tbl_crm_followup_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_crm_lead tbl_crm_lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_pkey PRIMARY KEY ("Lead_ID");


--
-- Name: tbl_crm_lead tbl_crm_lead_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_custom_order tbl_custom_order_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_order_number_unique UNIQUE ("Order_Number");


--
-- Name: tbl_custom_order tbl_custom_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_pkey PRIMARY KEY ("Order_ID");


--
-- Name: tbl_custom_order tbl_custom_order_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_customer_display_settings tbl_customer_display_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_display_settings
    ADD CONSTRAINT tbl_customer_display_settings_pkey PRIMARY KEY ("Setting_ID");


--
-- Name: tbl_customer_display_settings tbl_customer_display_settings_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_display_settings
    ADD CONSTRAINT tbl_customer_display_settings_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_customer_feedback tbl_customer_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback
    ADD CONSTRAINT tbl_customer_feedback_pkey PRIMARY KEY ("Feedback_ID");


--
-- Name: tbl_customer_feedback tbl_customer_feedback_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback
    ADD CONSTRAINT tbl_customer_feedback_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_customer_insurance tbl_customer_insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_pkey PRIMARY KEY ("Insurance_ID");


--
-- Name: tbl_customer_insurance tbl_customer_insurance_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_customer_master tbl_customer_master_customer_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master
    ADD CONSTRAINT tbl_customer_master_customer_code_unique UNIQUE ("Customer_Code");


--
-- Name: tbl_customer_master tbl_customer_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master
    ADD CONSTRAINT tbl_customer_master_pkey PRIMARY KEY ("Customer_ID");


--
-- Name: tbl_customer_master tbl_customer_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master
    ADD CONSTRAINT tbl_customer_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_customer_master tbl_customer_master_tenant_id_mobile_1_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master
    ADD CONSTRAINT tbl_customer_master_tenant_id_mobile_1_unique UNIQUE ("Tenant_ID", "Mobile_1");


--
-- Name: tbl_day_close tbl_day_close_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_pkey PRIMARY KEY ("Close_ID");


--
-- Name: tbl_day_close tbl_day_close_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_day_close tbl_day_close_tenant_id_branch_id_close_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_tenant_id_branch_id_close_date_unique UNIQUE ("Tenant_ID", "Branch_ID", "Close_Date");


--
-- Name: tbl_design_master tbl_design_master_design_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_design_master
    ADD CONSTRAINT tbl_design_master_design_code_unique UNIQUE ("Design_Code");


--
-- Name: tbl_design_master tbl_design_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_design_master
    ADD CONSTRAINT tbl_design_master_pkey PRIMARY KEY ("Design_ID");


--
-- Name: tbl_device_master tbl_device_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_device_master
    ADD CONSTRAINT tbl_device_master_pkey PRIMARY KEY ("Device_ID");


--
-- Name: tbl_diamond_color_master tbl_diamond_color_master_color_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_color_master
    ADD CONSTRAINT tbl_diamond_color_master_color_code_unique UNIQUE ("Color_Code");


--
-- Name: tbl_diamond_color_master tbl_diamond_color_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_color_master
    ADD CONSTRAINT tbl_diamond_color_master_pkey PRIMARY KEY ("Color_ID");


--
-- Name: tbl_diamond_quality_master tbl_diamond_quality_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_quality_master
    ADD CONSTRAINT tbl_diamond_quality_master_pkey PRIMARY KEY ("Quality_ID");


--
-- Name: tbl_diamond_quality_master tbl_diamond_quality_master_quality_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_quality_master
    ADD CONSTRAINT tbl_diamond_quality_master_quality_code_unique UNIQUE ("Quality_Code");


--
-- Name: tbl_diamond_shape_master tbl_diamond_shape_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_shape_master
    ADD CONSTRAINT tbl_diamond_shape_master_pkey PRIMARY KEY ("Shape_ID");


--
-- Name: tbl_diamond_shape_master tbl_diamond_shape_master_shape_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_diamond_shape_master
    ADD CONSTRAINT tbl_diamond_shape_master_shape_code_unique UNIQUE ("Shape_Code");


--
-- Name: tbl_display_settings tbl_display_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_display_settings
    ADD CONSTRAINT tbl_display_settings_pkey PRIMARY KEY ("Setting_ID");


--
-- Name: tbl_display_settings tbl_display_settings_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_display_settings
    ADD CONSTRAINT tbl_display_settings_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_display_settings tbl_display_settings_tenant_id_setting_type_reference_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_display_settings
    ADD CONSTRAINT tbl_display_settings_tenant_id_setting_type_reference_id_unique UNIQUE ("Tenant_ID", "Setting_Type", "Reference_ID");


--
-- Name: tbl_einvoice_log tbl_einvoice_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_einvoice_log
    ADD CONSTRAINT tbl_einvoice_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_einvoice_log tbl_einvoice_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_einvoice_log
    ADD CONSTRAINT tbl_einvoice_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_employee_details tbl_employee_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_employee_details
    ADD CONSTRAINT tbl_employee_details_pkey PRIMARY KEY ("User_ID");


--
-- Name: tbl_erp_modules tbl_erp_modules_module_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_erp_modules
    ADD CONSTRAINT tbl_erp_modules_module_key_unique UNIQUE ("Module_Key");


--
-- Name: tbl_erp_modules tbl_erp_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_erp_modules
    ADD CONSTRAINT tbl_erp_modules_pkey PRIMARY KEY ("Module_ID");


--
-- Name: tbl_floor_master tbl_floor_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master
    ADD CONSTRAINT tbl_floor_master_pkey PRIMARY KEY ("Floor_ID");


--
-- Name: tbl_floor_master tbl_floor_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master
    ADD CONSTRAINT tbl_floor_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_floor_master tbl_floor_master_tenant_id_branch_id_floor_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master
    ADD CONSTRAINT tbl_floor_master_tenant_id_branch_id_floor_code_unique UNIQUE ("Tenant_ID", "Branch_ID", "Floor_Code");


--
-- Name: tbl_gem_certificate tbl_gem_certificate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_pkey PRIMARY KEY ("Certificate_ID");


--
-- Name: tbl_gem_certificate tbl_gem_certificate_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_gem_certificate tbl_gem_certificate_tenant_id_certifying_lab_certificate_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_tenant_id_certifying_lab_certificate_number UNIQUE ("Tenant_ID", "Certifying_Lab", "Certificate_Number");


--
-- Name: tbl_gemstone_master tbl_gemstone_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gemstone_master
    ADD CONSTRAINT tbl_gemstone_master_pkey PRIMARY KEY ("Stone_ID");


--
-- Name: tbl_gemstone_master tbl_gemstone_master_stone_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gemstone_master
    ADD CONSTRAINT tbl_gemstone_master_stone_code_unique UNIQUE ("Stone_Code");


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_pkey PRIMARY KEY ("Voucher_ID");


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_voucher_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_voucher_code_unique UNIQUE ("Voucher_Code");


--
-- Name: tbl_gold_rate_history tbl_gold_rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gold_rate_history
    ADD CONSTRAINT tbl_gold_rate_history_pkey PRIMARY KEY ("Rate_ID");


--
-- Name: tbl_gold_rate_history tbl_gold_rate_history_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gold_rate_history
    ADD CONSTRAINT tbl_gold_rate_history_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_hidden_location_master tbl_hidden_location_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hidden_location_master
    ADD CONSTRAINT tbl_hidden_location_master_pkey PRIMARY KEY ("Hidden_Location_ID");


--
-- Name: tbl_hidden_location_master tbl_hidden_location_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hidden_location_master
    ADD CONSTRAINT tbl_hidden_location_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_hidden_location_master tbl_hidden_location_master_tenant_id_location_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hidden_location_master
    ADD CONSTRAINT tbl_hidden_location_master_tenant_id_location_code_unique UNIQUE ("Tenant_ID", "Location_Code");


--
-- Name: tbl_holiday_master tbl_holiday_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master
    ADD CONSTRAINT tbl_holiday_master_pkey PRIMARY KEY ("Holiday_ID");


--
-- Name: tbl_holiday_master tbl_holiday_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master
    ADD CONSTRAINT tbl_holiday_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_holiday_master tbl_holiday_master_tenant_id_branch_id_holiday_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master
    ADD CONSTRAINT tbl_holiday_master_tenant_id_branch_id_holiday_date_unique UNIQUE ("Tenant_ID", "Branch_ID", "Holiday_Date");


--
-- Name: tbl_hsn_master tbl_hsn_master_hsn_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hsn_master
    ADD CONSTRAINT tbl_hsn_master_hsn_code_unique UNIQUE ("HSN_Code");


--
-- Name: tbl_hsn_master tbl_hsn_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hsn_master
    ADD CONSTRAINT tbl_hsn_master_pkey PRIMARY KEY ("HSN_ID");


--
-- Name: tbl_huid_master tbl_huid_master_huid_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master
    ADD CONSTRAINT tbl_huid_master_huid_number_unique UNIQUE ("HUID_Number");


--
-- Name: tbl_huid_master tbl_huid_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master
    ADD CONSTRAINT tbl_huid_master_pkey PRIMARY KEY ("HUID_ID");


--
-- Name: tbl_huid_master tbl_huid_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master
    ADD CONSTRAINT tbl_huid_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_incentive_slab_master tbl_incentive_slab_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_incentive_slab_master
    ADD CONSTRAINT tbl_incentive_slab_master_pkey PRIMARY KEY ("Slab_ID");


--
-- Name: tbl_incentive_slab_master tbl_incentive_slab_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_incentive_slab_master
    ADD CONSTRAINT tbl_incentive_slab_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_insurance_policy_master tbl_insurance_policy_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_insurance_policy_master
    ADD CONSTRAINT tbl_insurance_policy_master_pkey PRIMARY KEY ("Policy_ID");


--
-- Name: tbl_insurance_policy_master tbl_insurance_policy_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_insurance_policy_master
    ADD CONSTRAINT tbl_insurance_policy_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_invoice_preview_data tbl_invoice_preview_data_document_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_preview_data
    ADD CONSTRAINT tbl_invoice_preview_data_document_type_unique UNIQUE ("Document_Type");


--
-- Name: tbl_invoice_preview_data tbl_invoice_preview_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_preview_data
    ADD CONSTRAINT tbl_invoice_preview_data_pkey PRIMARY KEY ("Preview_ID");


--
-- Name: tbl_invoice_studio_templates tbl_invoice_studio_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_studio_templates
    ADD CONSTRAINT tbl_invoice_studio_templates_pkey PRIMARY KEY ("Template_ID");


--
-- Name: tbl_invoice_studio_templates tbl_invoice_studio_templates_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_studio_templates
    ADD CONSTRAINT tbl_invoice_studio_templates_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_invoice_template_master tbl_invoice_template_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_template_master
    ADD CONSTRAINT tbl_invoice_template_master_pkey PRIMARY KEY ("Template_ID");


--
-- Name: tbl_invoice_template_master tbl_invoice_template_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_template_master
    ADD CONSTRAINT tbl_invoice_template_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_issue_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_issue_number_unique UNIQUE ("Issue_Number");


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_pkey PRIMARY KEY ("Issue_ID");


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_item_type_master tbl_item_type_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_item_type_master
    ADD CONSTRAINT tbl_item_type_master_pkey PRIMARY KEY ("Type_ID");


--
-- Name: tbl_item_type_master tbl_item_type_master_type_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_item_type_master
    ADD CONSTRAINT tbl_item_type_master_type_code_unique UNIQUE ("Type_Code");


--
-- Name: tbl_license_master tbl_license_master_license_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_license_master
    ADD CONSTRAINT tbl_license_master_license_key_unique UNIQUE ("License_Key");


--
-- Name: tbl_license_master tbl_license_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_license_master
    ADD CONSTRAINT tbl_license_master_pkey PRIMARY KEY ("License_ID");


--
-- Name: tbl_license_master tbl_license_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_license_master
    ADD CONSTRAINT tbl_license_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_loyalty_points_slab tbl_loyalty_points_slab_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_points_slab
    ADD CONSTRAINT tbl_loyalty_points_slab_pkey PRIMARY KEY ("Slab_ID");


--
-- Name: tbl_loyalty_points_slab tbl_loyalty_points_slab_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_points_slab
    ADD CONSTRAINT tbl_loyalty_points_slab_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_loyalty_transactions tbl_loyalty_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions
    ADD CONSTRAINT tbl_loyalty_transactions_pkey PRIMARY KEY ("Loyalty_ID");


--
-- Name: tbl_loyalty_transactions tbl_loyalty_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions
    ADD CONSTRAINT tbl_loyalty_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_making_charge_master tbl_making_charge_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_making_charge_master
    ADD CONSTRAINT tbl_making_charge_master_pkey PRIMARY KEY ("MC_ID");


--
-- Name: tbl_making_charge_master tbl_making_charge_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_making_charge_master
    ADD CONSTRAINT tbl_making_charge_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_melting_refining_log tbl_melting_refining_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log
    ADD CONSTRAINT tbl_melting_refining_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_melting_refining_log tbl_melting_refining_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log
    ADD CONSTRAINT tbl_melting_refining_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_mobile_otp tbl_mobile_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mobile_otp
    ADD CONSTRAINT tbl_mobile_otp_pkey PRIMARY KEY ("OTP_ID");


--
-- Name: tbl_mould_bom_stock tbl_mould_bom_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mould_bom_stock
    ADD CONSTRAINT tbl_mould_bom_stock_pkey PRIMARY KEY ("Mould_ID");


--
-- Name: tbl_mould_bom_stock tbl_mould_bom_stock_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mould_bom_stock
    ADD CONSTRAINT tbl_mould_bom_stock_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_pkey PRIMARY KEY ("NTA_Issue_ID");


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_voucher_number_unique UNIQUE ("Voucher_Number");


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_pkey PRIMARY KEY ("NTA_Issue_Item_ID");


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_pkey PRIMARY KEY ("NTA_Receive_ID");


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_voucher_number_unique UNIQUE ("Voucher_Number");


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_pkey PRIMARY KEY ("Exchange_ID");


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_voucher_number_unique UNIQUE ("Voucher_Number");


--
-- Name: tbl_ornament_master tbl_ornament_master_article_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_article_number_unique UNIQUE ("Article_Number");


--
-- Name: tbl_ornament_master tbl_ornament_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_pkey PRIMARY KEY ("Ornament_ID");


--
-- Name: tbl_ornament_master tbl_ornament_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_pawn_loan_guarantor tbl_pawn_loan_guarantor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_guarantor
    ADD CONSTRAINT tbl_pawn_loan_guarantor_pkey PRIMARY KEY ("Guarantor_ID");


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_loan_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_loan_number_unique UNIQUE ("Loan_Number");


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_pkey PRIMARY KEY ("Loan_ID");


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_pawn_loan_items tbl_pawn_loan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items
    ADD CONSTRAINT tbl_pawn_loan_items_pkey PRIMARY KEY ("Item_ID");


--
-- Name: tbl_pawn_loan_items tbl_pawn_loan_items_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items
    ADD CONSTRAINT tbl_pawn_loan_items_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_pawn_loan_transactions tbl_pawn_loan_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_transactions
    ADD CONSTRAINT tbl_pawn_loan_transactions_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_pawn_loan_transactions tbl_pawn_loan_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_transactions
    ADD CONSTRAINT tbl_pawn_loan_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_payment_gateway_config tbl_payment_gateway_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payment_gateway_config
    ADD CONSTRAINT tbl_payment_gateway_config_pkey PRIMARY KEY ("Config_ID");


--
-- Name: tbl_payment_gateway_config tbl_payment_gateway_config_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payment_gateway_config
    ADD CONSTRAINT tbl_payment_gateway_config_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_payment_gateway_config tbl_payment_gateway_config_tenant_id_gateway_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payment_gateway_config
    ADD CONSTRAINT tbl_payment_gateway_config_tenant_id_gateway_unique UNIQUE ("Tenant_ID", "Gateway");


--
-- Name: tbl_payroll_details tbl_payroll_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_details
    ADD CONSTRAINT tbl_payroll_details_pkey PRIMARY KEY ("Detail_ID");


--
-- Name: tbl_payroll_run tbl_payroll_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run
    ADD CONSTRAINT tbl_payroll_run_pkey PRIMARY KEY ("Run_ID");


--
-- Name: tbl_payroll_run tbl_payroll_run_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run
    ADD CONSTRAINT tbl_payroll_run_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_payroll_run tbl_payroll_run_tenant_id_branch_id_pay_month_pay_year_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run
    ADD CONSTRAINT tbl_payroll_run_tenant_id_branch_id_pay_month_pay_year_unique UNIQUE ("Tenant_ID", "Branch_ID", "Pay_Month", "Pay_Year");


--
-- Name: tbl_pg_order_track tbl_pg_order_track_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_order_track
    ADD CONSTRAINT tbl_pg_order_track_order_id_unique UNIQUE ("Order_ID");


--
-- Name: tbl_pg_order_track tbl_pg_order_track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_order_track
    ADD CONSTRAINT tbl_pg_order_track_pkey PRIMARY KEY ("Track_ID");


--
-- Name: tbl_pg_order_track tbl_pg_order_track_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_order_track
    ADD CONSTRAINT tbl_pg_order_track_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_pg_transactions tbl_pg_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_transactions
    ADD CONSTRAINT tbl_pg_transactions_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_pg_transactions tbl_pg_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pg_transactions
    ADD CONSTRAINT tbl_pg_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_printer_config tbl_printer_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_printer_config
    ADD CONSTRAINT tbl_printer_config_pkey PRIMARY KEY ("Config_ID");


--
-- Name: tbl_printer_config tbl_printer_config_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_printer_config
    ADD CONSTRAINT tbl_printer_config_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_product_images tbl_product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_product_images
    ADD CONSTRAINT tbl_product_images_pkey PRIMARY KEY ("Image_ID");


--
-- Name: tbl_product_images tbl_product_images_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_product_images
    ADD CONSTRAINT tbl_product_images_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_production_department_master tbl_production_department_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_department_master
    ADD CONSTRAINT tbl_production_department_master_pkey PRIMARY KEY ("Dept_ID");


--
-- Name: tbl_production_department_master tbl_production_department_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_department_master
    ADD CONSTRAINT tbl_production_department_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_production_department_master tbl_production_department_master_tenant_id_dept_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_department_master
    ADD CONSTRAINT tbl_production_department_master_tenant_id_dept_code_unique UNIQUE ("Tenant_ID", "Dept_Code");


--
-- Name: tbl_production_transaction tbl_production_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_production_transaction tbl_production_transaction_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_purchase_details tbl_purchase_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details
    ADD CONSTRAINT tbl_purchase_details_pkey PRIMARY KEY ("Detail_ID");


--
-- Name: tbl_purchase_details tbl_purchase_details_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details
    ADD CONSTRAINT tbl_purchase_details_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_purchase_header tbl_purchase_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_pkey PRIMARY KEY ("Purchase_ID");


--
-- Name: tbl_purchase_header tbl_purchase_header_purchase_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_purchase_number_unique UNIQUE ("Purchase_Number");


--
-- Name: tbl_purchase_header tbl_purchase_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_purity_master tbl_purity_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purity_master
    ADD CONSTRAINT tbl_purity_master_pkey PRIMARY KEY ("Purity_ID");


--
-- Name: tbl_purity_master tbl_purity_master_purity_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purity_master
    ADD CONSTRAINT tbl_purity_master_purity_code_unique UNIQUE ("Purity_Code");


--
-- Name: tbl_rate_booking tbl_rate_booking_booking_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_booking_number_unique UNIQUE ("Booking_Number");


--
-- Name: tbl_rate_booking tbl_rate_booking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_pkey PRIMARY KEY ("Booking_ID");


--
-- Name: tbl_rate_booking tbl_rate_booking_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_reorder_request tbl_reorder_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_pkey PRIMARY KEY ("Request_ID");


--
-- Name: tbl_reorder_request tbl_reorder_request_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_repair_orders tbl_repair_orders_job_card_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_job_card_number_unique UNIQUE ("Job_Card_Number");


--
-- Name: tbl_repair_orders tbl_repair_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_pkey PRIMARY KEY ("Repair_ID");


--
-- Name: tbl_repair_orders tbl_repair_orders_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_pkey PRIMARY KEY ("Return_ID");


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_return_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_return_number_unique UNIQUE ("Return_Number");


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_rfid_scan_log tbl_rfid_scan_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log
    ADD CONSTRAINT tbl_rfid_scan_log_pkey PRIMARY KEY ("Scan_ID");


--
-- Name: tbl_rfid_scan_log tbl_rfid_scan_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log
    ADD CONSTRAINT tbl_rfid_scan_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_role_master tbl_role_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_master
    ADD CONSTRAINT tbl_role_master_pkey PRIMARY KEY ("Role_ID");


--
-- Name: tbl_role_master tbl_role_master_role_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_role_master
    ADD CONSTRAINT tbl_role_master_role_name_unique UNIQUE ("Role_Name");


--
-- Name: tbl_salary_structure tbl_salary_structure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_salary_structure
    ADD CONSTRAINT tbl_salary_structure_pkey PRIMARY KEY ("Structure_ID");


--
-- Name: tbl_sales_details tbl_sales_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_details
    ADD CONSTRAINT tbl_sales_details_pkey PRIMARY KEY ("Detail_ID");


--
-- Name: tbl_sales_details tbl_sales_details_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_details
    ADD CONSTRAINT tbl_sales_details_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sales_header tbl_sales_header_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_invoice_number_unique UNIQUE ("Invoice_Number");


--
-- Name: tbl_sales_header tbl_sales_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_pkey PRIMARY KEY ("Sale_ID");


--
-- Name: tbl_sales_header tbl_sales_header_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sales_payments tbl_sales_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_payments
    ADD CONSTRAINT tbl_sales_payments_pkey PRIMARY KEY ("Payment_ID");


--
-- Name: tbl_sales_payments tbl_sales_payments_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_payments
    ADD CONSTRAINT tbl_sales_payments_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_enrollment_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_enrollment_number_unique UNIQUE ("Enrollment_Number");


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_pkey PRIMARY KEY ("Enrollment_ID");


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_saving_scheme_master tbl_saving_scheme_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_master
    ADD CONSTRAINT tbl_saving_scheme_master_pkey PRIMARY KEY ("Scheme_ID");


--
-- Name: tbl_saving_scheme_master tbl_saving_scheme_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_master
    ADD CONSTRAINT tbl_saving_scheme_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_saving_scheme_master tbl_saving_scheme_master_tenant_id_scheme_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_master
    ADD CONSTRAINT tbl_saving_scheme_master_tenant_id_scheme_code_unique UNIQUE ("Tenant_ID", "Scheme_Code");


--
-- Name: tbl_scheme_accounting_entries tbl_scheme_accounting_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_accounting_entries
    ADD CONSTRAINT tbl_scheme_accounting_entries_pkey PRIMARY KEY ("Entry_ID");


--
-- Name: tbl_scheme_accounting_entries tbl_scheme_accounting_entries_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_accounting_entries
    ADD CONSTRAINT tbl_scheme_accounting_entries_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_bonuses tbl_scheme_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_bonuses
    ADD CONSTRAINT tbl_scheme_bonuses_pkey PRIMARY KEY ("Bonus_ID");


--
-- Name: tbl_scheme_bonuses tbl_scheme_bonuses_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_bonuses
    ADD CONSTRAINT tbl_scheme_bonuses_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_draws tbl_scheme_draws_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_pkey PRIMARY KEY ("Draw_ID");


--
-- Name: tbl_scheme_draws tbl_scheme_draws_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_gold_conversion tbl_scheme_gold_conversion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_gold_conversion
    ADD CONSTRAINT tbl_scheme_gold_conversion_pkey PRIMARY KEY ("Conversion_ID");


--
-- Name: tbl_scheme_gold_conversion tbl_scheme_gold_conversion_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_gold_conversion
    ADD CONSTRAINT tbl_scheme_gold_conversion_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_groups tbl_scheme_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups
    ADD CONSTRAINT tbl_scheme_groups_pkey PRIMARY KEY ("Group_ID");


--
-- Name: tbl_scheme_groups tbl_scheme_groups_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups
    ADD CONSTRAINT tbl_scheme_groups_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_groups tbl_scheme_groups_tenant_id_scheme_id_group_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups
    ADD CONSTRAINT tbl_scheme_groups_tenant_id_scheme_id_group_code_unique UNIQUE ("Tenant_ID", "Scheme_ID", "Group_Code");


--
-- Name: tbl_scheme_installments tbl_scheme_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_installments
    ADD CONSTRAINT tbl_scheme_installments_pkey PRIMARY KEY ("Installment_ID");


--
-- Name: tbl_scheme_installments tbl_scheme_installments_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_installments
    ADD CONSTRAINT tbl_scheme_installments_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_master tbl_scheme_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_master
    ADD CONSTRAINT tbl_scheme_master_pkey PRIMARY KEY ("Scheme_ID");


--
-- Name: tbl_scheme_master tbl_scheme_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_master
    ADD CONSTRAINT tbl_scheme_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_master tbl_scheme_master_tenant_id_scheme_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_master
    ADD CONSTRAINT tbl_scheme_master_tenant_id_scheme_code_unique UNIQUE ("Tenant_ID", "Scheme_Code");


--
-- Name: tbl_scheme_members tbl_scheme_members_member_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_member_number_unique UNIQUE ("Member_Number");


--
-- Name: tbl_scheme_members tbl_scheme_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_pkey PRIMARY KEY ("Member_ID");


--
-- Name: tbl_scheme_members tbl_scheme_members_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_notifications tbl_scheme_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_notifications
    ADD CONSTRAINT tbl_scheme_notifications_pkey PRIMARY KEY ("Notif_ID");


--
-- Name: tbl_scheme_notifications tbl_scheme_notifications_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_notifications
    ADD CONSTRAINT tbl_scheme_notifications_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_pdc tbl_scheme_pdc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_pdc
    ADD CONSTRAINT tbl_scheme_pdc_pkey PRIMARY KEY ("PDC_ID");


--
-- Name: tbl_scheme_pdc tbl_scheme_pdc_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_pdc
    ADD CONSTRAINT tbl_scheme_pdc_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_policies tbl_scheme_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_policies
    ADD CONSTRAINT tbl_scheme_policies_pkey PRIMARY KEY ("Policy_ID");


--
-- Name: tbl_scheme_policies tbl_scheme_policies_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_policies
    ADD CONSTRAINT tbl_scheme_policies_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_settings tbl_scheme_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_settings
    ADD CONSTRAINT tbl_scheme_settings_pkey PRIMARY KEY ("Setting_ID");


--
-- Name: tbl_scheme_settings tbl_scheme_settings_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_settings
    ADD CONSTRAINT tbl_scheme_settings_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_scheme_settings tbl_scheme_settings_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_settings
    ADD CONSTRAINT tbl_scheme_settings_tenant_id_unique UNIQUE ("Tenant_ID");


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_pkey PRIMARY KEY ("Txn_ID");


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_receipt_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_receipt_number_unique UNIQUE ("Receipt_Number");


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_session_master tbl_session_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_session_master
    ADD CONSTRAINT tbl_session_master_pkey PRIMARY KEY ("Session_ID");


--
-- Name: tbl_session_master tbl_session_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_session_master
    ADD CONSTRAINT tbl_session_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sms_gateway_config tbl_sms_gateway_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_gateway_config
    ADD CONSTRAINT tbl_sms_gateway_config_pkey PRIMARY KEY ("Config_ID");


--
-- Name: tbl_sms_gateway_config tbl_sms_gateway_config_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_gateway_config
    ADD CONSTRAINT tbl_sms_gateway_config_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sms_log tbl_sms_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_log
    ADD CONSTRAINT tbl_sms_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_sms_log tbl_sms_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_log
    ADD CONSTRAINT tbl_sms_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sms_templates tbl_sms_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_templates
    ADD CONSTRAINT tbl_sms_templates_pkey PRIMARY KEY ("Template_ID");


--
-- Name: tbl_sms_templates tbl_sms_templates_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_templates
    ADD CONSTRAINT tbl_sms_templates_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_stock_transfer_items tbl_stock_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer_items
    ADD CONSTRAINT tbl_stock_transfer_items_pkey PRIMARY KEY ("Item_ID");


--
-- Name: tbl_stock_transfer tbl_stock_transfer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_pkey PRIMARY KEY ("Transfer_ID");


--
-- Name: tbl_stock_transfer tbl_stock_transfer_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_stock_transfer tbl_stock_transfer_transfer_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_transfer_number_unique UNIQUE ("Transfer_Number");


--
-- Name: tbl_sub_category_master tbl_sub_category_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master
    ADD CONSTRAINT tbl_sub_category_master_pkey PRIMARY KEY ("SubCat_ID");


--
-- Name: tbl_sub_category_master tbl_sub_category_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master
    ADD CONSTRAINT tbl_sub_category_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_sub_category_master tbl_sub_category_master_tenant_id_subcat_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master
    ADD CONSTRAINT tbl_sub_category_master_tenant_id_subcat_code_unique UNIQUE ("Tenant_ID", "SubCat_Code");


--
-- Name: tbl_subscription_plan_master tbl_subscription_plan_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_subscription_plan_master
    ADD CONSTRAINT tbl_subscription_plan_master_pkey PRIMARY KEY ("Plan_ID");


--
-- Name: tbl_sync_log tbl_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_log
    ADD CONSTRAINT tbl_sync_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_sync_queue tbl_sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_queue
    ADD CONSTRAINT tbl_sync_queue_pkey PRIMARY KEY ("Queue_ID");


--
-- Name: tbl_system_setting tbl_system_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_system_setting
    ADD CONSTRAINT tbl_system_setting_pkey PRIMARY KEY ("Setting_Key");


--
-- Name: tbl_tally_config tbl_tally_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_config
    ADD CONSTRAINT tbl_tally_config_pkey PRIMARY KEY ("Config_ID");


--
-- Name: tbl_tally_config tbl_tally_config_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_config
    ADD CONSTRAINT tbl_tally_config_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tally_config tbl_tally_config_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_config
    ADD CONSTRAINT tbl_tally_config_tenant_id_unique UNIQUE ("Tenant_ID");


--
-- Name: tbl_tally_sync_log tbl_tally_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_sync_log
    ADD CONSTRAINT tbl_tally_sync_log_pkey PRIMARY KEY ("Log_ID");


--
-- Name: tbl_tally_sync_log tbl_tally_sync_log_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_sync_log
    ADD CONSTRAINT tbl_tally_sync_log_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tenant_app_config tbl_tenant_app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_app_config
    ADD CONSTRAINT tbl_tenant_app_config_pkey PRIMARY KEY ("Config_ID");


--
-- Name: tbl_tenant_app_config tbl_tenant_app_config_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_app_config
    ADD CONSTRAINT tbl_tenant_app_config_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tenant_app_config tbl_tenant_app_config_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_app_config
    ADD CONSTRAINT tbl_tenant_app_config_tenant_id_unique UNIQUE ("Tenant_ID");


--
-- Name: tbl_tenant_master tbl_tenant_master_license_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_master
    ADD CONSTRAINT tbl_tenant_master_license_key_unique UNIQUE ("License_Key");


--
-- Name: tbl_tenant_master tbl_tenant_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_master
    ADD CONSTRAINT tbl_tenant_master_pkey PRIMARY KEY ("Tenant_ID");


--
-- Name: tbl_tenant_master tbl_tenant_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_master
    ADD CONSTRAINT tbl_tenant_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tenant_modules tbl_tenant_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_modules
    ADD CONSTRAINT tbl_tenant_modules_pkey PRIMARY KEY ("TM_ID");


--
-- Name: tbl_tenant_modules tbl_tenant_modules_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_modules
    ADD CONSTRAINT tbl_tenant_modules_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tenant_modules tbl_tenant_modules_tenant_id_module_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_modules
    ADD CONSTRAINT tbl_tenant_modules_tenant_id_module_key_unique UNIQUE ("Tenant_ID", "Module_Key");


--
-- Name: tbl_tenant_rates tbl_tenant_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_rates
    ADD CONSTRAINT tbl_tenant_rates_pkey PRIMARY KEY ("Rate_ID");


--
-- Name: tbl_tenant_rates tbl_tenant_rates_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_rates
    ADD CONSTRAINT tbl_tenant_rates_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tenant_subscription tbl_tenant_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_subscription
    ADD CONSTRAINT tbl_tenant_subscription_pkey PRIMARY KEY ("Subscription_ID");


--
-- Name: tbl_tenant_ui_theme tbl_tenant_ui_theme_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_ui_theme
    ADD CONSTRAINT tbl_tenant_ui_theme_pkey PRIMARY KEY ("Tenant_ID");


--
-- Name: tbl_tenant_ui_theme tbl_tenant_ui_theme_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_ui_theme
    ADD CONSTRAINT tbl_tenant_ui_theme_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tray_master tbl_tray_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_pkey PRIMARY KEY ("Tray_ID");


--
-- Name: tbl_tray_master tbl_tray_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_tray_master tbl_tray_master_tenant_id_branch_id_counter_id_tray_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_tenant_id_branch_id_counter_id_tray_code_unique UNIQUE ("Tenant_ID", "Branch_ID", "Counter_ID", "Tray_Code");


--
-- Name: tbl_user_bin_access tbl_user_bin_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_bin_access
    ADD CONSTRAINT tbl_user_bin_access_pkey PRIMARY KEY ("Access_ID");


--
-- Name: tbl_user_master tbl_user_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master
    ADD CONSTRAINT tbl_user_master_pkey PRIMARY KEY ("User_ID");


--
-- Name: tbl_user_master tbl_user_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master
    ADD CONSTRAINT tbl_user_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_user_master tbl_user_master_tenant_id_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master
    ADD CONSTRAINT tbl_user_master_tenant_id_username_unique UNIQUE ("Tenant_ID", "Username");


--
-- Name: tbl_user_permission_override tbl_user_permission_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_permission_override
    ADD CONSTRAINT tbl_user_permission_override_pkey PRIMARY KEY ("Override_ID");


--
-- Name: tbl_user_permission_override tbl_user_permission_override_user_id_module_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_permission_override
    ADD CONSTRAINT tbl_user_permission_override_user_id_module_key_unique UNIQUE ("User_ID", "Module_Key");


--
-- Name: tbl_vendor_master tbl_vendor_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_vendor_master
    ADD CONSTRAINT tbl_vendor_master_pkey PRIMARY KEY ("Vendor_ID");


--
-- Name: tbl_vendor_master tbl_vendor_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_vendor_master
    ADD CONSTRAINT tbl_vendor_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_vendor_master tbl_vendor_master_vendor_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_vendor_master
    ADD CONSTRAINT tbl_vendor_master_vendor_code_unique UNIQUE ("Vendor_Code");


--
-- Name: tbl_voucher_master tbl_voucher_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_voucher_master
    ADD CONSTRAINT tbl_voucher_master_pkey PRIMARY KEY ("Voucher_PK");


--
-- Name: tbl_voucher_master tbl_voucher_master_sync_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_voucher_master
    ADD CONSTRAINT tbl_voucher_master_sync_uuid_unique UNIQUE ("Sync_UUID");


--
-- Name: tbl_voucher_master tbl_voucher_master_voucher_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_voucher_master
    ADD CONSTRAINT tbl_voucher_master_voucher_id_unique UNIQUE ("Voucher_ID");


--
-- Name: tbl_sms_gateway_config uq_sms_gateway_tenant_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_gateway_config
    ADD CONSTRAINT uq_sms_gateway_tenant_provider UNIQUE ("Tenant_ID", "Provider");


--
-- Name: tbl_sms_templates uq_sms_template_tenant_purpose; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_templates
    ADD CONSTRAINT uq_sms_template_tenant_purpose UNIQUE ("Tenant_ID", "Purpose");


--
-- Name: tbl_tenant_rates uq_tenant_rate_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_rates
    ADD CONSTRAINT uq_tenant_rate_date UNIQUE ("Tenant_ID", "Rate_Date");


--
-- Name: idx_accounting_entries_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_entries_data_mode ON public.tbl_accounting_entries USING btree ("Data_Mode");


--
-- Name: idx_accounting_journal_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_journal_data_mode ON public.tbl_accounting_journal USING btree ("Data_Mode");


--
-- Name: idx_acct_entries_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acct_entries_account ON public.tbl_accounting_entries USING btree ("Account_ID");


--
-- Name: idx_acct_entries_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acct_entries_journal ON public.tbl_accounting_entries USING btree ("Journal_ID");


--
-- Name: idx_agent_commission_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_commission_source ON public.tbl_agent_commission_transactions USING btree ("Source_Type", "Source_ID");


--
-- Name: idx_agent_commission_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_commission_status ON public.tbl_agent_commission_transactions USING btree ("Agent_ID", "Status");


--
-- Name: idx_amc_enrollment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_amc_enrollment_status ON public.tbl_amc_enrollment USING btree ("Tenant_ID", "Status");


--
-- Name: idx_approval_issue_items_ornament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_issue_items_ornament ON public.tbl_approval_issue_items USING btree ("Ornament_ID");


--
-- Name: idx_approval_issue_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_issue_items_status ON public.tbl_approval_issue_items USING btree ("Issue_ID", "Item_Status");


--
-- Name: idx_approval_issue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_issue_status ON public.tbl_approval_issue_header USING btree ("Tenant_ID", "Status");


--
-- Name: idx_approval_party_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_party_name ON public.tbl_approval_party_master USING btree ("Tenant_ID", "Party_Name");


--
-- Name: idx_approval_receive_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_receive_date ON public.tbl_approval_receive_header USING btree ("Tenant_ID", "Receive_Date");


--
-- Name: idx_approval_receive_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_receive_issue ON public.tbl_approval_receive_header USING btree ("Issue_ID");


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.tbl_attendance USING btree ("Tenant_ID", "Attendance_Date");


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.tbl_audit_log USING btree ("Action_Type");


--
-- Name: idx_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_table ON public.tbl_audit_log USING btree ("Table_Name", "Record_ID");


--
-- Name: idx_audit_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant ON public.tbl_audit_log USING btree ("Tenant_ID");


--
-- Name: idx_audit_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_date ON public.tbl_audit_log USING btree ("Tenant_ID", "Action_Timestamp");


--
-- Name: idx_audit_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_ts ON public.tbl_audit_log USING btree ("Action_Timestamp");


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.tbl_audit_log USING btree ("User_ID");


--
-- Name: idx_binord_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binord_status ON public.tbl_bin_orders USING btree ("Status");


--
-- Name: idx_binord_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binord_tid ON public.tbl_bin_orders USING btree ("Tenant_ID");


--
-- Name: idx_binpg_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binpg_tid ON public.tbl_bin_pure_gold USING btree ("Tenant_ID");


--
-- Name: idx_binpur_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binpur_status ON public.tbl_bin_purchase USING btree ("Status");


--
-- Name: idx_binpur_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binpur_tid ON public.tbl_bin_purchase USING btree ("Tenant_ID");


--
-- Name: idx_binsrb_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binsrb_tid ON public.tbl_bin_sales_return USING btree ("Tenant_ID");


--
-- Name: idx_bom_stages_bom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bom_stages_bom ON public.tbl_bom_department_stages USING btree ("BOM_ID");


--
-- Name: idx_cheque_register_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheque_register_number ON public.tbl_cheque_register USING btree ("Cheque_Number");


--
-- Name: idx_cheque_register_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cheque_register_status ON public.tbl_cheque_register USING btree ("Tenant_ID", "Status");


--
-- Name: idx_coa_tenant_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_tenant_group ON public.tbl_chart_of_accounts USING btree ("Tenant_ID", "Account_Group");


--
-- Name: idx_crm_followup_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_followup_customer ON public.tbl_crm_followup USING btree ("Customer_ID");


--
-- Name: idx_crm_followup_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_followup_lead ON public.tbl_crm_followup USING btree ("Lead_ID");


--
-- Name: idx_crm_followup_next; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_followup_next ON public.tbl_crm_followup USING btree ("Next_Followup_Date");


--
-- Name: idx_crm_lead_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_mobile ON public.tbl_crm_lead USING btree ("Mobile");


--
-- Name: idx_crm_lead_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_status ON public.tbl_crm_lead USING btree ("Tenant_ID", "Status");


--
-- Name: idx_customer_feedback_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_feedback_customer ON public.tbl_customer_feedback USING btree ("Customer_ID");


--
-- Name: idx_customer_insurance_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_insurance_customer ON public.tbl_customer_insurance USING btree ("Customer_ID");


--
-- Name: idx_customer_insurance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_insurance_status ON public.tbl_customer_insurance USING btree ("Tenant_ID", "Status");


--
-- Name: idx_customer_master_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_master_data_mode ON public.tbl_customer_master USING btree ("Data_Mode");


--
-- Name: idx_customer_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_mobile ON public.tbl_customer_master USING btree ("Mobile_1");


--
-- Name: idx_customer_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tenant ON public.tbl_customer_master USING btree ("Tenant_ID");


--
-- Name: idx_device_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_tenant_status ON public.tbl_device_master USING btree ("Tenant_ID", "Status");


--
-- Name: idx_einvoice_log_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_einvoice_log_sale ON public.tbl_einvoice_log USING btree ("Sale_ID");


--
-- Name: idx_einvoice_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_einvoice_log_status ON public.tbl_einvoice_log USING btree ("Tenant_ID", "Status");


--
-- Name: idx_gem_certificate_ornament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gem_certificate_ornament ON public.tbl_gem_certificate USING btree ("Ornament_ID");


--
-- Name: idx_group_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_status ON public.tbl_scheme_groups USING btree ("Tenant_ID", "Status");


--
-- Name: idx_huid_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_huid_number ON public.tbl_huid_master USING btree ("Tenant_ID", "HUID_Number");


--
-- Name: idx_issue_karigar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issue_karigar ON public.tbl_issue_to_karigar USING btree ("Karigar_ID", "Status");


--
-- Name: idx_issue_to_karigar_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issue_to_karigar_data_mode ON public.tbl_issue_to_karigar USING btree ("Data_Mode");


--
-- Name: idx_loyalty_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_customer ON public.tbl_loyalty_transactions USING btree ("Tenant_ID", "Customer_ID");


--
-- Name: idx_melting_refining_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_melting_refining_type ON public.tbl_melting_refining_log USING btree ("Tenant_ID", "Process_Type");


--
-- Name: idx_member_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_group ON public.tbl_scheme_members USING btree ("Tenant_ID", "Group_ID");


--
-- Name: idx_member_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_mobile ON public.tbl_scheme_members USING btree ("Tenant_ID", "Mobile");


--
-- Name: idx_member_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_status ON public.tbl_scheme_members USING btree ("Tenant_ID", "Status");


--
-- Name: idx_notif_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_status ON public.tbl_scheme_notifications USING btree ("Tenant_ID", "Type", "Status");


--
-- Name: idx_nta_issue_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nta_issue_items_status ON public.tbl_non_tag_issue_items USING btree ("NTA_Issue_ID", "Item_Status");


--
-- Name: idx_nta_issue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nta_issue_status ON public.tbl_non_tag_issue_header USING btree ("Tenant_ID", "Status");


--
-- Name: idx_nta_receive_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nta_receive_issue ON public.tbl_non_tag_receive_header USING btree ("NTA_Issue_ID");


--
-- Name: idx_ornament_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_active ON public.tbl_ornament_master USING btree ("Is_Active", "Is_Sold");


--
-- Name: idx_ornament_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_article ON public.tbl_ornament_master USING btree ("Article_Number");


--
-- Name: idx_ornament_is_hidden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_is_hidden ON public.tbl_ornament_master USING btree ("Tenant_ID", "Is_Hidden");


--
-- Name: idx_ornament_master_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_master_data_mode ON public.tbl_ornament_master USING btree ("Data_Mode");


--
-- Name: idx_ornament_on_approval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_on_approval ON public.tbl_ornament_master USING btree ("Tenant_ID", "Is_On_Approval");


--
-- Name: idx_ornament_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ornament_tenant ON public.tbl_ornament_master USING btree ("Tenant_ID");


--
-- Name: idx_otp_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_mobile ON public.tbl_mobile_otp USING btree ("Mobile");


--
-- Name: idx_pawn_guarantor_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pawn_guarantor_loan ON public.tbl_pawn_loan_guarantor USING btree ("Loan_ID");


--
-- Name: idx_pawn_items_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pawn_items_loan ON public.tbl_pawn_loan_items USING btree ("Loan_ID");


--
-- Name: idx_pawn_loan_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pawn_loan_customer ON public.tbl_pawn_loan_header USING btree ("Customer_ID");


--
-- Name: idx_pawn_loan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pawn_loan_status ON public.tbl_pawn_loan_header USING btree ("Tenant_ID", "Status");


--
-- Name: idx_pawn_txn_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pawn_txn_loan ON public.tbl_pawn_loan_transactions USING btree ("Loan_ID");


--
-- Name: idx_payroll_details_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_details_run ON public.tbl_payroll_details USING btree ("Run_ID");


--
-- Name: idx_pdc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdc_status ON public.tbl_scheme_pdc USING btree ("Tenant_ID", "Status");


--
-- Name: idx_pg_txn_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pg_txn_member ON public.tbl_pg_transactions USING btree ("Member_ID");


--
-- Name: idx_pg_txn_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pg_txn_tenant ON public.tbl_pg_transactions USING btree ("Tenant_ID", "Gateway");


--
-- Name: idx_printer_config_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printer_config_lookup ON public.tbl_printer_config USING btree ("Tenant_ID", "Branch_ID", "Printer_Role");


--
-- Name: idx_prod_img; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_img ON public.tbl_product_images USING btree ("Tenant_ID", "Article_Number");


--
-- Name: idx_prod_img_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_img_article ON public.tbl_product_images USING btree ("Article_Number");


--
-- Name: idx_prod_img_ornament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_img_ornament ON public.tbl_product_images USING btree ("Ornament_ID");


--
-- Name: idx_prod_txn_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_txn_dept ON public.tbl_production_transaction USING btree ("Tenant_ID", "Dept_ID");


--
-- Name: idx_prod_txn_ornament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prod_txn_ornament ON public.tbl_production_transaction USING btree ("Ornament_ID");


--
-- Name: idx_purchase_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_date ON public.tbl_purchase_header USING btree ("Tenant_ID", "Purchase_Date");


--
-- Name: idx_purchase_header_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_header_data_mode ON public.tbl_purchase_header USING btree ("Data_Mode");


--
-- Name: idx_rate_booking_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_booking_status ON public.tbl_rate_booking USING btree ("Tenant_ID", "Status");


--
-- Name: idx_rate_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_date ON public.tbl_gold_rate_history USING btree ("Rate_Date");


--
-- Name: idx_reorder_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reorder_status ON public.tbl_reorder_request USING btree ("Tenant_ID", "Status");


--
-- Name: idx_repair_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repair_status ON public.tbl_repair_orders USING btree ("Tenant_ID", "Status");


--
-- Name: idx_rfid_scan_ornament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfid_scan_ornament ON public.tbl_rfid_scan_log USING btree ("Ornament_ID");


--
-- Name: idx_rfid_scan_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfid_scan_tag ON public.tbl_rfid_scan_log USING btree ("RFID_Tag");


--
-- Name: idx_salary_structure_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_structure_user ON public.tbl_salary_structure USING btree ("User_ID", "Is_Active");


--
-- Name: idx_sale_payments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_payments ON public.tbl_sales_payments USING btree ("Sale_ID");


--
-- Name: idx_sales_counter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_counter ON public.tbl_sales_header USING btree ("Tenant_ID", "Counter_ID");


--
-- Name: idx_sales_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_customer ON public.tbl_sales_header USING btree ("Customer_ID");


--
-- Name: idx_sales_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_date ON public.tbl_sales_header USING btree ("Sale_Date");


--
-- Name: idx_sales_header_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_header_data_mode ON public.tbl_sales_header USING btree ("Data_Mode");


--
-- Name: idx_sales_incentive_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_incentive_sale ON public.tbl_sales_incentive_transactions USING btree ("Sale_ID");


--
-- Name: idx_sales_incentive_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_incentive_user ON public.tbl_sales_incentive_transactions USING btree ("User_ID");


--
-- Name: idx_sales_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_invoice ON public.tbl_sales_header USING btree ("Invoice_Number");


--
-- Name: idx_sales_payments_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_payments_data_mode ON public.tbl_sales_payments USING btree ("Data_Mode");


--
-- Name: idx_sales_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_tenant ON public.tbl_sales_header USING btree ("Tenant_ID");


--
-- Name: idx_sales_voucher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_voucher_id ON public.tbl_sales_header USING btree ("Voucher_ID");


--
-- Name: idx_scheme_groups_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheme_groups_data_mode ON public.tbl_scheme_groups USING btree ("Data_Mode");


--
-- Name: idx_scheme_members_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheme_members_data_mode ON public.tbl_scheme_members USING btree ("Data_Mode");


--
-- Name: idx_scheme_policies_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheme_policies_lookup ON public.tbl_scheme_policies USING btree ("Tenant_ID", "Policy_Type", "Sort_Order");


--
-- Name: idx_scheme_transactions_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheme_transactions_data_mode ON public.tbl_scheme_transactions USING btree ("Data_Mode");


--
-- Name: idx_sms_log_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_log_tenant_date ON public.tbl_sms_log USING btree ("Tenant_ID", "Created_Date");


--
-- Name: idx_stock_transfer_data_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_transfer_data_mode ON public.tbl_stock_transfer USING btree ("Data_Mode");


--
-- Name: idx_studio_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_studio_lookup ON public.tbl_invoice_studio_templates USING btree ("Tenant_ID", "Document_Type", "Is_Default");


--
-- Name: idx_sync_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_status ON public.tbl_sync_log USING btree ("Tenant_ID", "Status");


--
-- Name: idx_sync_log_sync_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_sync_uuid ON public.tbl_sync_log USING btree ("Record_Sync_UUID");


--
-- Name: idx_sync_queue_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_queue_device ON public.tbl_sync_queue USING btree ("Device_ID");


--
-- Name: idx_sync_queue_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_queue_record ON public.tbl_sync_queue USING btree ("Table_Name", "Record_ID");


--
-- Name: idx_sync_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_queue_status ON public.tbl_sync_queue USING btree ("Tenant_ID", "Status");


--
-- Name: idx_sync_queue_sync_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_queue_sync_uuid ON public.tbl_sync_queue USING btree ("Record_Sync_UUID");


--
-- Name: idx_tally_sync_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tally_sync_reference ON public.tbl_tally_sync_log USING btree ("Reference_Table", "Reference_ID");


--
-- Name: idx_tally_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tally_sync_status ON public.tbl_tally_sync_log USING btree ("Tenant_ID", "Status");


--
-- Name: idx_template_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_lookup ON public.tbl_invoice_template_master USING btree ("Tenant_ID", "Document_Type", "Is_Active");


--
-- Name: idx_tenant_rate_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_rate_lookup ON public.tbl_tenant_rates USING btree ("Tenant_ID", "Rate_Date");


--
-- Name: idx_tenant_subscription_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_subscription_status ON public.tbl_tenant_subscription USING btree ("Tenant_ID", "Status");


--
-- Name: idx_transfer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfer_status ON public.tbl_stock_transfer USING btree ("Tenant_ID", "Status");


--
-- Name: idx_txn_agent_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_agent_code ON public.tbl_scheme_transactions USING btree ("Agent_Code");


--
-- Name: idx_txn_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_date ON public.tbl_scheme_transactions USING btree ("Tenant_ID", "Payment_Date");


--
-- Name: idx_txn_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_member ON public.tbl_scheme_transactions USING btree ("Tenant_ID", "Member_ID");


--
-- Name: idx_user_bin_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_bin_access_user ON public.tbl_user_bin_access USING btree ("User_ID");


--
-- Name: idx_voucher_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_code ON public.tbl_gift_vouchers USING btree ("Tenant_ID", "Voucher_Code");


--
-- Name: idx_voucher_tid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_tid ON public.tbl_voucher_master USING btree ("Tenant_ID");


--
-- Name: tbl_accounting_entries tbl_accounting_entries_account_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_account_id_foreign FOREIGN KEY ("Account_ID") REFERENCES public.tbl_chart_of_accounts("Account_ID") ON DELETE SET NULL;


--
-- Name: tbl_accounting_entries tbl_accounting_entries_journal_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_journal_id_foreign FOREIGN KEY ("Journal_ID") REFERENCES public.tbl_accounting_journal("Journal_ID") ON DELETE CASCADE;


--
-- Name: tbl_agent_commission_transactions tbl_agent_commission_transactions_agent_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_commission_transactions
    ADD CONSTRAINT tbl_agent_commission_transactions_agent_id_foreign FOREIGN KEY ("Agent_ID") REFERENCES public.tbl_agent_master("Agent_ID") ON DELETE CASCADE;


--
-- Name: tbl_agent_commission_transactions tbl_agent_commission_transactions_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_agent_commission_transactions
    ADD CONSTRAINT tbl_agent_commission_transactions_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_plan_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_plan_id_foreign FOREIGN KEY ("Plan_ID") REFERENCES public.tbl_amc_plan_master("Plan_ID") ON DELETE SET NULL;


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_amc_enrollment tbl_amc_enrollment_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_enrollment
    ADD CONSTRAINT tbl_amc_enrollment_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_amc_plan_master tbl_amc_plan_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_amc_plan_master
    ADD CONSTRAINT tbl_amc_plan_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_party_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_party_id_foreign FOREIGN KEY ("Party_ID") REFERENCES public.tbl_approval_party_master("Party_ID") ON DELETE SET NULL;


--
-- Name: tbl_approval_issue_header tbl_approval_issue_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_header
    ADD CONSTRAINT tbl_approval_issue_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_issue_id_foreign FOREIGN KEY ("Issue_ID") REFERENCES public.tbl_approval_issue_header("Issue_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_received_in_receive_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_received_in_receive_id_foreign FOREIGN KEY ("Received_In_Receive_ID") REFERENCES public.tbl_approval_receive_header("Receive_ID") ON DELETE SET NULL;


--
-- Name: tbl_approval_issue_items tbl_approval_issue_items_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_issue_items
    ADD CONSTRAINT tbl_approval_issue_items_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_party_master tbl_approval_party_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_party_master
    ADD CONSTRAINT tbl_approval_party_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_issue_id_foreign FOREIGN KEY ("Issue_ID") REFERENCES public.tbl_approval_issue_header("Issue_ID") ON DELETE CASCADE;


--
-- Name: tbl_approval_receive_header tbl_approval_receive_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_approval_receive_header
    ADD CONSTRAINT tbl_approval_receive_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_attendance tbl_attendance_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance
    ADD CONSTRAINT tbl_attendance_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_attendance tbl_attendance_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_attendance
    ADD CONSTRAINT tbl_attendance_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_bank_account_master tbl_bank_account_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master
    ADD CONSTRAINT tbl_bank_account_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_bank_account_master tbl_bank_account_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bank_account_master
    ADD CONSTRAINT tbl_bank_account_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_bom_department_stages tbl_bom_department_stages_bom_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_department_stages
    ADD CONSTRAINT tbl_bom_department_stages_bom_id_foreign FOREIGN KEY ("BOM_ID") REFERENCES public.tbl_bom_master("BOM_ID") ON DELETE CASCADE;


--
-- Name: tbl_bom_department_stages tbl_bom_department_stages_dept_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_department_stages
    ADD CONSTRAINT tbl_bom_department_stages_dept_id_foreign FOREIGN KEY ("Dept_ID") REFERENCES public.tbl_production_department_master("Dept_ID") ON DELETE CASCADE;


--
-- Name: tbl_bom_master tbl_bom_master_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master
    ADD CONSTRAINT tbl_bom_master_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_bom_master tbl_bom_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master
    ADD CONSTRAINT tbl_bom_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_bom_master tbl_bom_master_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_bom_master
    ADD CONSTRAINT tbl_bom_master_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_branch_master tbl_branch_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_branch_master
    ADD CONSTRAINT tbl_branch_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_brand_master tbl_brand_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_brand_master
    ADD CONSTRAINT tbl_brand_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_card_charges_master tbl_card_charges_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_card_charges_master
    ADD CONSTRAINT tbl_card_charges_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_catalog_order_items tbl_catalog_order_items_order_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_order_items
    ADD CONSTRAINT tbl_catalog_order_items_order_id_foreign FOREIGN KEY ("Order_ID") REFERENCES public.tbl_catalog_orders("Order_ID") ON DELETE CASCADE;


--
-- Name: tbl_catalog_wishlist tbl_catalog_wishlist_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE CASCADE;


--
-- Name: tbl_chart_of_accounts tbl_chart_of_accounts_bank_account_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts
    ADD CONSTRAINT tbl_chart_of_accounts_bank_account_id_foreign FOREIGN KEY ("Bank_Account_ID") REFERENCES public.tbl_bank_account_master("Account_ID") ON DELETE SET NULL;


--
-- Name: tbl_chart_of_accounts tbl_chart_of_accounts_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_chart_of_accounts
    ADD CONSTRAINT tbl_chart_of_accounts_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_cheque_register tbl_cheque_register_account_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_cheque_register
    ADD CONSTRAINT tbl_cheque_register_account_id_foreign FOREIGN KEY ("Account_ID") REFERENCES public.tbl_bank_account_master("Account_ID") ON DELETE SET NULL;


--
-- Name: tbl_cheque_register tbl_cheque_register_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_cheque_register
    ADD CONSTRAINT tbl_cheque_register_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_collection_master tbl_collection_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_collection_master
    ADD CONSTRAINT tbl_collection_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_counter_master tbl_counter_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE CASCADE;


--
-- Name: tbl_counter_master tbl_counter_master_floor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_floor_id_foreign FOREIGN KEY ("Floor_ID") REFERENCES public.tbl_floor_master("Floor_ID") ON DELETE CASCADE;


--
-- Name: tbl_counter_master tbl_counter_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_counter_master
    ADD CONSTRAINT tbl_counter_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_crm_followup tbl_crm_followup_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE CASCADE;


--
-- Name: tbl_crm_followup tbl_crm_followup_done_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_done_by_foreign FOREIGN KEY ("Done_By") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_crm_followup tbl_crm_followup_lead_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_lead_id_foreign FOREIGN KEY ("Lead_ID") REFERENCES public.tbl_crm_lead("Lead_ID") ON DELETE CASCADE;


--
-- Name: tbl_crm_followup tbl_crm_followup_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_followup
    ADD CONSTRAINT tbl_crm_followup_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_crm_lead tbl_crm_lead_assigned_to_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_assigned_to_foreign FOREIGN KEY ("Assigned_To") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_crm_lead tbl_crm_lead_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_crm_lead tbl_crm_lead_converted_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_converted_customer_id_foreign FOREIGN KEY ("Converted_Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_crm_lead tbl_crm_lead_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_crm_lead
    ADD CONSTRAINT tbl_crm_lead_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_custom_order tbl_custom_order_assigned_karigar_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_assigned_karigar_id_foreign FOREIGN KEY ("Assigned_Karigar_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_custom_order tbl_custom_order_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_custom_order tbl_custom_order_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_custom_order tbl_custom_order_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_custom_order
    ADD CONSTRAINT tbl_custom_order_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_customer_display_settings tbl_customer_display_settings_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_display_settings
    ADD CONSTRAINT tbl_customer_display_settings_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_display_settings tbl_customer_display_settings_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_display_settings
    ADD CONSTRAINT tbl_customer_display_settings_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_customer_feedback tbl_customer_feedback_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback
    ADD CONSTRAINT tbl_customer_feedback_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_feedback tbl_customer_feedback_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback
    ADD CONSTRAINT tbl_customer_feedback_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_feedback tbl_customer_feedback_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_feedback
    ADD CONSTRAINT tbl_customer_feedback_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_customer_insurance tbl_customer_insurance_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_insurance tbl_customer_insurance_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_insurance tbl_customer_insurance_policy_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_policy_id_foreign FOREIGN KEY ("Policy_ID") REFERENCES public.tbl_insurance_policy_master("Policy_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_insurance tbl_customer_insurance_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_customer_insurance tbl_customer_insurance_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_insurance
    ADD CONSTRAINT tbl_customer_insurance_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_customer_master tbl_customer_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_customer_master
    ADD CONSTRAINT tbl_customer_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_day_close tbl_day_close_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_day_close tbl_day_close_closed_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_closed_by_foreign FOREIGN KEY ("Closed_By") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_day_close tbl_day_close_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_day_close
    ADD CONSTRAINT tbl_day_close_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_design_master tbl_design_master_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_design_master
    ADD CONSTRAINT tbl_design_master_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_device_master tbl_device_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_device_master
    ADD CONSTRAINT tbl_device_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_device_master tbl_device_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_device_master
    ADD CONSTRAINT tbl_device_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_einvoice_log tbl_einvoice_log_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_einvoice_log
    ADD CONSTRAINT tbl_einvoice_log_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE CASCADE;


--
-- Name: tbl_einvoice_log tbl_einvoice_log_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_einvoice_log
    ADD CONSTRAINT tbl_einvoice_log_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_employee_details tbl_employee_details_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_employee_details
    ADD CONSTRAINT tbl_employee_details_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_floor_master tbl_floor_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master
    ADD CONSTRAINT tbl_floor_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE CASCADE;


--
-- Name: tbl_floor_master tbl_floor_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_floor_master
    ADD CONSTRAINT tbl_floor_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_gem_certificate tbl_gem_certificate_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_gem_certificate tbl_gem_certificate_stone_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_stone_id_foreign FOREIGN KEY ("Stone_ID") REFERENCES public.tbl_gemstone_master("Stone_ID") ON DELETE SET NULL;


--
-- Name: tbl_gem_certificate tbl_gem_certificate_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gem_certificate
    ADD CONSTRAINT tbl_gem_certificate_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_issued_to_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_issued_to_customer_id_foreign FOREIGN KEY ("Issued_To_Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_gift_vouchers tbl_gift_vouchers_used_in_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gift_vouchers
    ADD CONSTRAINT tbl_gift_vouchers_used_in_sale_id_foreign FOREIGN KEY ("Used_In_Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_gold_rate_history tbl_gold_rate_history_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_gold_rate_history
    ADD CONSTRAINT tbl_gold_rate_history_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_hidden_location_master tbl_hidden_location_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_hidden_location_master
    ADD CONSTRAINT tbl_hidden_location_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_holiday_master tbl_holiday_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master
    ADD CONSTRAINT tbl_holiday_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_holiday_master tbl_holiday_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_holiday_master
    ADD CONSTRAINT tbl_holiday_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_huid_master tbl_huid_master_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master
    ADD CONSTRAINT tbl_huid_master_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_huid_master tbl_huid_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_huid_master
    ADD CONSTRAINT tbl_huid_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_incentive_slab_master tbl_incentive_slab_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_incentive_slab_master
    ADD CONSTRAINT tbl_incentive_slab_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_insurance_policy_master tbl_insurance_policy_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_insurance_policy_master
    ADD CONSTRAINT tbl_insurance_policy_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_invoice_studio_templates tbl_invoice_studio_templates_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_studio_templates
    ADD CONSTRAINT tbl_invoice_studio_templates_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_invoice_template_master tbl_invoice_template_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_template_master
    ADD CONSTRAINT tbl_invoice_template_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_invoice_template_master tbl_invoice_template_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_invoice_template_master
    ADD CONSTRAINT tbl_invoice_template_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_karigar_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_karigar_id_foreign FOREIGN KEY ("Karigar_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_purity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_purity_id_foreign FOREIGN KEY ("Purity_ID") REFERENCES public.tbl_purity_master("Purity_ID") ON DELETE SET NULL;


--
-- Name: tbl_issue_to_karigar tbl_issue_to_karigar_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_issue_to_karigar
    ADD CONSTRAINT tbl_issue_to_karigar_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_license_master tbl_license_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_license_master
    ADD CONSTRAINT tbl_license_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_loyalty_points_slab tbl_loyalty_points_slab_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_points_slab
    ADD CONSTRAINT tbl_loyalty_points_slab_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_loyalty_transactions tbl_loyalty_transactions_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions
    ADD CONSTRAINT tbl_loyalty_transactions_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE CASCADE;


--
-- Name: tbl_loyalty_transactions tbl_loyalty_transactions_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions
    ADD CONSTRAINT tbl_loyalty_transactions_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_loyalty_transactions tbl_loyalty_transactions_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_loyalty_transactions
    ADD CONSTRAINT tbl_loyalty_transactions_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_making_charge_master tbl_making_charge_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_making_charge_master
    ADD CONSTRAINT tbl_making_charge_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_making_charge_master tbl_making_charge_master_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_making_charge_master
    ADD CONSTRAINT tbl_making_charge_master_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_melting_refining_log tbl_melting_refining_log_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log
    ADD CONSTRAINT tbl_melting_refining_log_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_melting_refining_log tbl_melting_refining_log_refiner_vendor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log
    ADD CONSTRAINT tbl_melting_refining_log_refiner_vendor_id_foreign FOREIGN KEY ("Refiner_Vendor_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_melting_refining_log tbl_melting_refining_log_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_melting_refining_log
    ADD CONSTRAINT tbl_melting_refining_log_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_mould_bom_stock tbl_mould_bom_stock_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mould_bom_stock
    ADD CONSTRAINT tbl_mould_bom_stock_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_mould_bom_stock tbl_mould_bom_stock_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_mould_bom_stock
    ADD CONSTRAINT tbl_mould_bom_stock_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_party_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_party_id_foreign FOREIGN KEY ("Party_ID") REFERENCES public.tbl_approval_party_master("Party_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_issue_header tbl_non_tag_issue_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_header
    ADD CONSTRAINT tbl_non_tag_issue_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_nta_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_nta_issue_id_foreign FOREIGN KEY ("NTA_Issue_ID") REFERENCES public.tbl_non_tag_issue_header("NTA_Issue_ID") ON DELETE CASCADE;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_purity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_purity_id_foreign FOREIGN KEY ("Purity_ID") REFERENCES public.tbl_purity_master("Purity_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_received_in_receive_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_received_in_receive_id_foreign FOREIGN KEY ("Received_In_Receive_ID") REFERENCES public.tbl_non_tag_receive_header("NTA_Receive_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_non_tag_issue_items tbl_non_tag_issue_items_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_issue_items
    ADD CONSTRAINT tbl_non_tag_issue_items_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_nta_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_nta_issue_id_foreign FOREIGN KEY ("NTA_Issue_ID") REFERENCES public.tbl_non_tag_issue_header("NTA_Issue_ID") ON DELETE CASCADE;


--
-- Name: tbl_non_tag_receive_header tbl_non_tag_receive_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_non_tag_receive_header
    ADD CONSTRAINT tbl_non_tag_receive_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_old_gold_exchange tbl_old_gold_exchange_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_old_gold_exchange
    ADD CONSTRAINT tbl_old_gold_exchange_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_ornament_master tbl_ornament_master_approval_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_approval_issue_id_foreign FOREIGN KEY ("Approval_Issue_ID") REFERENCES public.tbl_approval_issue_header("Issue_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_approval_receive_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_approval_receive_id_foreign FOREIGN KEY ("Approval_Receive_ID") REFERENCES public.tbl_approval_receive_header("Receive_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_brand_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_brand_id_foreign FOREIGN KEY ("Brand_ID") REFERENCES public.tbl_brand_master("Brand_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_collection_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_collection_id_foreign FOREIGN KEY ("Collection_ID") REFERENCES public.tbl_collection_master("Collection_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_counter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_counter_id_foreign FOREIGN KEY ("Counter_ID") REFERENCES public.tbl_counter_master("Counter_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_floor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_floor_id_foreign FOREIGN KEY ("Floor_ID") REFERENCES public.tbl_floor_master("Floor_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_hidden_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_hidden_location_id_foreign FOREIGN KEY ("Hidden_Location_ID") REFERENCES public.tbl_hidden_location_master("Hidden_Location_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_karigar_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_karigar_id_foreign FOREIGN KEY ("Karigar_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_mc_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_mc_id_foreign FOREIGN KEY ("MC_ID") REFERENCES public.tbl_making_charge_master("MC_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_purity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_purity_id_foreign FOREIGN KEY ("Purity_ID") REFERENCES public.tbl_purity_master("Purity_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_stone_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_stone_id_foreign FOREIGN KEY ("Stone_ID") REFERENCES public.tbl_gemstone_master("Stone_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_subcat_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_subcat_id_foreign FOREIGN KEY ("SubCat_ID") REFERENCES public.tbl_sub_category_master("SubCat_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_supplier_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_supplier_id_foreign FOREIGN KEY ("Supplier_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_ornament_master tbl_ornament_master_tray_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_tray_id_foreign FOREIGN KEY ("Tray_ID") REFERENCES public.tbl_tray_master("Tray_ID") ON DELETE SET NULL;


--
-- Name: tbl_ornament_master tbl_ornament_master_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_ornament_master
    ADD CONSTRAINT tbl_ornament_master_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_pawn_loan_guarantor tbl_pawn_loan_guarantor_loan_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_guarantor
    ADD CONSTRAINT tbl_pawn_loan_guarantor_loan_id_foreign FOREIGN KEY ("Loan_ID") REFERENCES public.tbl_pawn_loan_header("Loan_ID") ON DELETE CASCADE;


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_pawn_loan_header tbl_pawn_loan_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_header
    ADD CONSTRAINT tbl_pawn_loan_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_pawn_loan_items tbl_pawn_loan_items_loan_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items
    ADD CONSTRAINT tbl_pawn_loan_items_loan_id_foreign FOREIGN KEY ("Loan_ID") REFERENCES public.tbl_pawn_loan_header("Loan_ID") ON DELETE CASCADE;


--
-- Name: tbl_pawn_loan_items tbl_pawn_loan_items_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items
    ADD CONSTRAINT tbl_pawn_loan_items_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_pawn_loan_items tbl_pawn_loan_items_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_items
    ADD CONSTRAINT tbl_pawn_loan_items_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_pawn_loan_transactions tbl_pawn_loan_transactions_loan_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_transactions
    ADD CONSTRAINT tbl_pawn_loan_transactions_loan_id_foreign FOREIGN KEY ("Loan_ID") REFERENCES public.tbl_pawn_loan_header("Loan_ID") ON DELETE CASCADE;


--
-- Name: tbl_pawn_loan_transactions tbl_pawn_loan_transactions_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_pawn_loan_transactions
    ADD CONSTRAINT tbl_pawn_loan_transactions_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_payroll_details tbl_payroll_details_run_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_details
    ADD CONSTRAINT tbl_payroll_details_run_id_foreign FOREIGN KEY ("Run_ID") REFERENCES public.tbl_payroll_run("Run_ID") ON DELETE CASCADE;


--
-- Name: tbl_payroll_details tbl_payroll_details_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_details
    ADD CONSTRAINT tbl_payroll_details_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_payroll_run tbl_payroll_run_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run
    ADD CONSTRAINT tbl_payroll_run_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_payroll_run tbl_payroll_run_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_payroll_run
    ADD CONSTRAINT tbl_payroll_run_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_printer_config tbl_printer_config_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_printer_config
    ADD CONSTRAINT tbl_printer_config_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE CASCADE;


--
-- Name: tbl_printer_config tbl_printer_config_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_printer_config
    ADD CONSTRAINT tbl_printer_config_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_product_images tbl_product_images_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_product_images
    ADD CONSTRAINT tbl_product_images_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_department_master tbl_production_department_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_department_master
    ADD CONSTRAINT tbl_production_department_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_production_transaction tbl_production_transaction_bom_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_bom_id_foreign FOREIGN KEY ("BOM_ID") REFERENCES public.tbl_bom_master("BOM_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_transaction tbl_production_transaction_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_transaction tbl_production_transaction_dept_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_dept_id_foreign FOREIGN KEY ("Dept_ID") REFERENCES public.tbl_production_department_master("Dept_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_transaction tbl_production_transaction_karigar_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_karigar_id_foreign FOREIGN KEY ("Karigar_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_transaction tbl_production_transaction_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_production_transaction tbl_production_transaction_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_production_transaction
    ADD CONSTRAINT tbl_production_transaction_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_purchase_details tbl_purchase_details_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details
    ADD CONSTRAINT tbl_purchase_details_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_purchase_details tbl_purchase_details_purchase_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details
    ADD CONSTRAINT tbl_purchase_details_purchase_id_foreign FOREIGN KEY ("Purchase_ID") REFERENCES public.tbl_purchase_header("Purchase_ID") ON DELETE CASCADE;


--
-- Name: tbl_purchase_details tbl_purchase_details_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_details
    ADD CONSTRAINT tbl_purchase_details_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_purchase_header tbl_purchase_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_purchase_header tbl_purchase_header_supplier_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_supplier_id_foreign FOREIGN KEY ("Supplier_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_purchase_header tbl_purchase_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_purchase_header
    ADD CONSTRAINT tbl_purchase_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_rate_booking tbl_rate_booking_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_rate_booking tbl_rate_booking_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_rate_booking tbl_rate_booking_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_rate_booking tbl_rate_booking_utilized_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rate_booking
    ADD CONSTRAINT tbl_rate_booking_utilized_sale_id_foreign FOREIGN KEY ("Utilized_Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_reorder_request tbl_reorder_request_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_reorder_request tbl_reorder_request_design_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_design_id_foreign FOREIGN KEY ("Design_ID") REFERENCES public.tbl_design_master("Design_ID") ON DELETE SET NULL;


--
-- Name: tbl_reorder_request tbl_reorder_request_fulfilled_purchase_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_fulfilled_purchase_id_foreign FOREIGN KEY ("Fulfilled_Purchase_ID") REFERENCES public.tbl_purchase_header("Purchase_ID") ON DELETE SET NULL;


--
-- Name: tbl_reorder_request tbl_reorder_request_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_reorder_request tbl_reorder_request_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_reorder_request
    ADD CONSTRAINT tbl_reorder_request_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_repair_orders tbl_repair_orders_assigned_karigar_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_assigned_karigar_id_foreign FOREIGN KEY ("Assigned_Karigar_ID") REFERENCES public.tbl_vendor_master("Vendor_ID") ON DELETE SET NULL;


--
-- Name: tbl_repair_orders tbl_repair_orders_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_repair_orders tbl_repair_orders_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_repair_orders tbl_repair_orders_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_repair_orders
    ADD CONSTRAINT tbl_repair_orders_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_issue_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_issue_id_foreign FOREIGN KEY ("Issue_ID") REFERENCES public.tbl_issue_to_karigar("Issue_ID") ON DELETE CASCADE;


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_return_from_karigar tbl_return_from_karigar_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_return_from_karigar
    ADD CONSTRAINT tbl_return_from_karigar_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_rfid_scan_log tbl_rfid_scan_log_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log
    ADD CONSTRAINT tbl_rfid_scan_log_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_rfid_scan_log tbl_rfid_scan_log_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log
    ADD CONSTRAINT tbl_rfid_scan_log_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_rfid_scan_log tbl_rfid_scan_log_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_rfid_scan_log
    ADD CONSTRAINT tbl_rfid_scan_log_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_salary_structure tbl_salary_structure_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_salary_structure
    ADD CONSTRAINT tbl_salary_structure_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_details tbl_sales_details_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_details
    ADD CONSTRAINT tbl_sales_details_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_details tbl_sales_details_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_details
    ADD CONSTRAINT tbl_sales_details_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_header tbl_sales_header_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_header tbl_sales_header_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_header tbl_sales_header_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_header
    ADD CONSTRAINT tbl_sales_header_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_payroll_run_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_payroll_run_id_foreign FOREIGN KEY ("Payroll_Run_ID") REFERENCES public.tbl_payroll_run("Run_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_slab_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_slab_id_foreign FOREIGN KEY ("Slab_ID") REFERENCES public.tbl_incentive_slab_master("Slab_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_incentive_transactions tbl_sales_incentive_transactions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_incentive_transactions
    ADD CONSTRAINT tbl_sales_incentive_transactions_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_sales_payments tbl_sales_payments_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_payments
    ADD CONSTRAINT tbl_sales_payments_sale_id_foreign FOREIGN KEY ("Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE CASCADE;


--
-- Name: tbl_sales_payments tbl_sales_payments_voucher_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sales_payments
    ADD CONSTRAINT tbl_sales_payments_voucher_id_foreign FOREIGN KEY ("Voucher_ID") REFERENCES public.tbl_gift_vouchers("Voucher_ID") ON DELETE SET NULL;


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_redemption_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_redemption_sale_id_foreign FOREIGN KEY ("Redemption_Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_scheme_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_scheme_id_foreign FOREIGN KEY ("Scheme_ID") REFERENCES public.tbl_saving_scheme_master("Scheme_ID") ON DELETE SET NULL;


--
-- Name: tbl_saving_scheme_enrollment tbl_saving_scheme_enrollment_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_enrollment
    ADD CONSTRAINT tbl_saving_scheme_enrollment_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_saving_scheme_master tbl_saving_scheme_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_saving_scheme_master
    ADD CONSTRAINT tbl_saving_scheme_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_bonuses tbl_scheme_bonuses_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_bonuses
    ADD CONSTRAINT tbl_scheme_bonuses_member_id_foreign FOREIGN KEY ("Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_bonuses tbl_scheme_bonuses_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_bonuses
    ADD CONSTRAINT tbl_scheme_bonuses_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_draws tbl_scheme_draws_group_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_group_id_foreign FOREIGN KEY ("Group_ID") REFERENCES public.tbl_scheme_groups("Group_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_draws tbl_scheme_draws_scheme_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_scheme_id_foreign FOREIGN KEY ("Scheme_ID") REFERENCES public.tbl_scheme_master("Scheme_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_draws tbl_scheme_draws_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_draws tbl_scheme_draws_winner_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_draws
    ADD CONSTRAINT tbl_scheme_draws_winner_member_id_foreign FOREIGN KEY ("Winner_Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_gold_conversion tbl_scheme_gold_conversion_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_gold_conversion
    ADD CONSTRAINT tbl_scheme_gold_conversion_member_id_foreign FOREIGN KEY ("Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_gold_conversion tbl_scheme_gold_conversion_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_gold_conversion
    ADD CONSTRAINT tbl_scheme_gold_conversion_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_groups tbl_scheme_groups_scheme_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups
    ADD CONSTRAINT tbl_scheme_groups_scheme_id_foreign FOREIGN KEY ("Scheme_ID") REFERENCES public.tbl_scheme_master("Scheme_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_groups tbl_scheme_groups_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_groups
    ADD CONSTRAINT tbl_scheme_groups_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_installments tbl_scheme_installments_enrollment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_installments
    ADD CONSTRAINT tbl_scheme_installments_enrollment_id_foreign FOREIGN KEY ("Enrollment_ID") REFERENCES public.tbl_saving_scheme_enrollment("Enrollment_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_master tbl_scheme_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_master
    ADD CONSTRAINT tbl_scheme_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_members tbl_scheme_members_customer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_customer_id_foreign FOREIGN KEY ("Customer_ID") REFERENCES public.tbl_customer_master("Customer_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_members tbl_scheme_members_group_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_group_id_foreign FOREIGN KEY ("Group_ID") REFERENCES public.tbl_scheme_groups("Group_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_members tbl_scheme_members_redemption_sale_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_redemption_sale_id_foreign FOREIGN KEY ("Redemption_Sale_ID") REFERENCES public.tbl_sales_header("Sale_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_members tbl_scheme_members_salesman_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_salesman_user_id_foreign FOREIGN KEY ("Salesman_User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_members tbl_scheme_members_scheme_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_scheme_id_foreign FOREIGN KEY ("Scheme_ID") REFERENCES public.tbl_scheme_master("Scheme_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_members tbl_scheme_members_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_members
    ADD CONSTRAINT tbl_scheme_members_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_notifications tbl_scheme_notifications_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_notifications
    ADD CONSTRAINT tbl_scheme_notifications_member_id_foreign FOREIGN KEY ("Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_notifications tbl_scheme_notifications_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_notifications
    ADD CONSTRAINT tbl_scheme_notifications_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_pdc tbl_scheme_pdc_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_pdc
    ADD CONSTRAINT tbl_scheme_pdc_member_id_foreign FOREIGN KEY ("Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_pdc tbl_scheme_pdc_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_pdc
    ADD CONSTRAINT tbl_scheme_pdc_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_policies tbl_scheme_policies_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_policies
    ADD CONSTRAINT tbl_scheme_policies_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_settings tbl_scheme_settings_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_settings
    ADD CONSTRAINT tbl_scheme_settings_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_collected_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_collected_by_foreign FOREIGN KEY ("Collected_By") REFERENCES public.tbl_user_master("User_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_member_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_member_id_foreign FOREIGN KEY ("Member_ID") REFERENCES public.tbl_scheme_members("Member_ID") ON DELETE SET NULL;


--
-- Name: tbl_scheme_transactions tbl_scheme_transactions_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_scheme_transactions
    ADD CONSTRAINT tbl_scheme_transactions_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_session_master tbl_session_master_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_session_master
    ADD CONSTRAINT tbl_session_master_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_sms_gateway_config tbl_sms_gateway_config_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_gateway_config
    ADD CONSTRAINT tbl_sms_gateway_config_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_sms_templates tbl_sms_templates_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sms_templates
    ADD CONSTRAINT tbl_sms_templates_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_from_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_from_branch_id_foreign FOREIGN KEY ("From_Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_from_counter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_from_counter_id_foreign FOREIGN KEY ("From_Counter_ID") REFERENCES public.tbl_counter_master("Counter_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_from_floor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_from_floor_id_foreign FOREIGN KEY ("From_Floor_ID") REFERENCES public.tbl_floor_master("Floor_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_from_tray_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_from_tray_id_foreign FOREIGN KEY ("From_Tray_ID") REFERENCES public.tbl_tray_master("Tray_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer_items tbl_stock_transfer_items_ornament_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer_items
    ADD CONSTRAINT tbl_stock_transfer_items_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer_items tbl_stock_transfer_items_transfer_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer_items
    ADD CONSTRAINT tbl_stock_transfer_items_transfer_id_foreign FOREIGN KEY ("Transfer_ID") REFERENCES public.tbl_stock_transfer("Transfer_ID") ON DELETE CASCADE;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_to_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_to_branch_id_foreign FOREIGN KEY ("To_Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_to_counter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_to_counter_id_foreign FOREIGN KEY ("To_Counter_ID") REFERENCES public.tbl_counter_master("Counter_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_to_floor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_to_floor_id_foreign FOREIGN KEY ("To_Floor_ID") REFERENCES public.tbl_floor_master("Floor_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_to_hidden_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_to_hidden_location_id_foreign FOREIGN KEY ("To_Hidden_Location_ID") REFERENCES public.tbl_hidden_location_master("Hidden_Location_ID") ON DELETE SET NULL;


--
-- Name: tbl_stock_transfer tbl_stock_transfer_to_tray_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_stock_transfer
    ADD CONSTRAINT tbl_stock_transfer_to_tray_id_foreign FOREIGN KEY ("To_Tray_ID") REFERENCES public.tbl_tray_master("Tray_ID") ON DELETE SET NULL;


--
-- Name: tbl_sub_category_master tbl_sub_category_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master
    ADD CONSTRAINT tbl_sub_category_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_sub_category_master tbl_sub_category_master_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sub_category_master
    ADD CONSTRAINT tbl_sub_category_master_type_id_foreign FOREIGN KEY ("Type_ID") REFERENCES public.tbl_item_type_master("Type_ID") ON DELETE SET NULL;


--
-- Name: tbl_sync_log tbl_sync_log_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_log
    ADD CONSTRAINT tbl_sync_log_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_sync_queue tbl_sync_queue_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_queue
    ADD CONSTRAINT tbl_sync_queue_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE SET NULL;


--
-- Name: tbl_sync_queue tbl_sync_queue_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_sync_queue
    ADD CONSTRAINT tbl_sync_queue_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tally_config tbl_tally_config_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_config
    ADD CONSTRAINT tbl_tally_config_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tally_sync_log tbl_tally_sync_log_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tally_sync_log
    ADD CONSTRAINT tbl_tally_sync_log_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tenant_rates tbl_tenant_rates_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_rates
    ADD CONSTRAINT tbl_tenant_rates_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tenant_subscription tbl_tenant_subscription_plan_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_subscription
    ADD CONSTRAINT tbl_tenant_subscription_plan_id_foreign FOREIGN KEY ("Plan_ID") REFERENCES public.tbl_subscription_plan_master("Plan_ID") ON DELETE SET NULL;


--
-- Name: tbl_tenant_subscription tbl_tenant_subscription_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_subscription
    ADD CONSTRAINT tbl_tenant_subscription_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tenant_ui_theme tbl_tenant_ui_theme_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tenant_ui_theme
    ADD CONSTRAINT tbl_tenant_ui_theme_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_tray_master tbl_tray_master_branch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_branch_id_foreign FOREIGN KEY ("Branch_ID") REFERENCES public.tbl_branch_master("Branch_ID") ON DELETE CASCADE;


--
-- Name: tbl_tray_master tbl_tray_master_counter_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_counter_id_foreign FOREIGN KEY ("Counter_ID") REFERENCES public.tbl_counter_master("Counter_ID") ON DELETE CASCADE;


--
-- Name: tbl_tray_master tbl_tray_master_floor_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_floor_id_foreign FOREIGN KEY ("Floor_ID") REFERENCES public.tbl_floor_master("Floor_ID") ON DELETE CASCADE;


--
-- Name: tbl_tray_master tbl_tray_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_tray_master
    ADD CONSTRAINT tbl_tray_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_user_bin_access tbl_user_bin_access_hidden_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_bin_access
    ADD CONSTRAINT tbl_user_bin_access_hidden_location_id_foreign FOREIGN KEY ("Hidden_Location_ID") REFERENCES public.tbl_hidden_location_master("Hidden_Location_ID") ON DELETE CASCADE;


--
-- Name: tbl_user_bin_access tbl_user_bin_access_tray_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_bin_access
    ADD CONSTRAINT tbl_user_bin_access_tray_id_foreign FOREIGN KEY ("Tray_ID") REFERENCES public.tbl_tray_master("Tray_ID") ON DELETE CASCADE;


--
-- Name: tbl_user_bin_access tbl_user_bin_access_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_bin_access
    ADD CONSTRAINT tbl_user_bin_access_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_user_master tbl_user_master_role_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master
    ADD CONSTRAINT tbl_user_master_role_id_foreign FOREIGN KEY ("Role_ID") REFERENCES public.tbl_role_master("Role_ID") ON DELETE SET NULL;


--
-- Name: tbl_user_master tbl_user_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_master
    ADD CONSTRAINT tbl_user_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- Name: tbl_user_permission_override tbl_user_permission_override_module_key_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_permission_override
    ADD CONSTRAINT tbl_user_permission_override_module_key_foreign FOREIGN KEY ("Module_Key") REFERENCES public.tbl_erp_modules("Module_Key") ON DELETE CASCADE;


--
-- Name: tbl_user_permission_override tbl_user_permission_override_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_user_permission_override
    ADD CONSTRAINT tbl_user_permission_override_user_id_foreign FOREIGN KEY ("User_ID") REFERENCES public.tbl_user_master("User_ID") ON DELETE CASCADE;


--
-- Name: tbl_vendor_master tbl_vendor_master_tenant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tbl_vendor_master
    ADD CONSTRAINT tbl_vendor_master_tenant_id_foreign FOREIGN KEY ("Tenant_ID") REFERENCES public.tbl_tenant_master("Tenant_ID") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ra0C3URMFi4JqIs4HU4oltYEwo1SfkQeuGd8wM4v3cFbRfh3irDW3l9GJgK5CeR

