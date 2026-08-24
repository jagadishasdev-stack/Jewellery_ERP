/**
 * Schema-drift fix: these 11 tables exist in the live JewelleryERP database
 * but were never created by any migration file (created manually/out-of-band
 * at some point). Discovered by running the migration set against a brand
 * new empty database as part of the database-per-tenant migration — a fresh
 * tenant database would otherwise be missing accounting, bin management,
 * agent, wishlist, mobile OTP, scheme accounting, tenant app config, and
 * voucher tables entirely.
 *
 * DDL below reproduces the exact live schema (columns, defaults, PKs,
 * uniques, indexes, FKs) via `pg_dump --schema-only` rather than hand-transcribed
 * knex builder calls, to avoid transcription mistakes on production-critical
 * tables. Guarded with IF NOT EXISTS-equivalent existence checks so this is
 * safe to run against the live control-plane database too (which already
 * has these tables) as well as any brand-new tenant database (which won't).
 */
exports.up = async function (knex) {
  const existing = await knex.raw(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tbl_accounting_entries'
  `);
  if (existing.rows.length > 0) {
    // Already present (e.g. the control-plane DB) — nothing to do.
    return;
  }

  await knex.raw(`
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
    "Entry_Date" date
);



CREATE SEQUENCE public."tbl_accounting_entries_Entry_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_accounting_entries_Entry_ID_seq" OWNED BY public.tbl_accounting_entries."Entry_ID";



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
    "Data_Mode" smallint DEFAULT '3'::smallint NOT NULL
);



CREATE SEQUENCE public."tbl_accounting_journal_Journal_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_accounting_journal_Journal_ID_seq" OWNED BY public.tbl_accounting_journal."Journal_ID";



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
    "Modified_Date" timestamp with time zone
);



CREATE SEQUENCE public."tbl_agent_master_Agent_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_agent_master_Agent_ID_seq" OWNED BY public.tbl_agent_master."Agent_ID";



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
    "Modified_Date" timestamp with time zone
);



CREATE SEQUENCE public."tbl_bin_orders_Order_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_bin_orders_Order_ID_seq" OWNED BY public.tbl_bin_orders."Order_ID";



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
    "Modified_Date" timestamp with time zone
);



CREATE SEQUENCE public."tbl_bin_purchase_Bin_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_bin_purchase_Bin_ID_seq" OWNED BY public.tbl_bin_purchase."Bin_ID";



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
    "Modified_Date" timestamp with time zone
);



CREATE SEQUENCE public."tbl_bin_pure_gold_Gold_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_bin_pure_gold_Gold_ID_seq" OWNED BY public.tbl_bin_pure_gold."Gold_ID";



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
    "Modified_Date" timestamp with time zone
);



CREATE SEQUENCE public."tbl_bin_sales_return_Return_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_bin_sales_return_Return_ID_seq" OWNED BY public.tbl_bin_sales_return."Return_ID";



CREATE TABLE public.tbl_catalog_wishlist (
    "Wishlist_ID" integer NOT NULL,
    "Tenant_ID" character varying(50) NOT NULL,
    "Ornament_ID" integer,
    "Article_Number" character varying(50) NOT NULL,
    "Customer_Mobile" character varying(20),
    "Customer_ID" integer,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



CREATE SEQUENCE public."tbl_catalog_wishlist_Wishlist_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_catalog_wishlist_Wishlist_ID_seq" OWNED BY public.tbl_catalog_wishlist."Wishlist_ID";



CREATE TABLE public.tbl_mobile_otp (
    "OTP_ID" integer NOT NULL,
    "Mobile" character varying(20) NOT NULL,
    "OTP" character varying(6) NOT NULL,
    "Purpose" character varying(30) DEFAULT 'LOGIN'::character varying,
    "Is_Used" boolean DEFAULT false,
    "Expires_At" timestamp with time zone NOT NULL,
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



CREATE SEQUENCE public."tbl_mobile_otp_OTP_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_mobile_otp_OTP_ID_seq" OWNED BY public.tbl_mobile_otp."OTP_ID";



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
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



CREATE SEQUENCE public."tbl_scheme_accounting_entries_Entry_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_scheme_accounting_entries_Entry_ID_seq" OWNED BY public.tbl_scheme_accounting_entries."Entry_ID";



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
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



CREATE SEQUENCE public."tbl_tenant_app_config_Config_ID_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_tenant_app_config_Config_ID_seq" OWNED BY public.tbl_tenant_app_config."Config_ID";



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
    "Created_Date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



CREATE SEQUENCE public."tbl_voucher_master_Voucher_PK_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public."tbl_voucher_master_Voucher_PK_seq" OWNED BY public.tbl_voucher_master."Voucher_PK";



ALTER TABLE ONLY public.tbl_accounting_entries ALTER COLUMN "Entry_ID" SET DEFAULT nextval('public."tbl_accounting_entries_Entry_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_accounting_journal ALTER COLUMN "Journal_ID" SET DEFAULT nextval('public."tbl_accounting_journal_Journal_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_agent_master ALTER COLUMN "Agent_ID" SET DEFAULT nextval('public."tbl_agent_master_Agent_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_bin_orders ALTER COLUMN "Order_ID" SET DEFAULT nextval('public."tbl_bin_orders_Order_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_bin_purchase ALTER COLUMN "Bin_ID" SET DEFAULT nextval('public."tbl_bin_purchase_Bin_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_bin_pure_gold ALTER COLUMN "Gold_ID" SET DEFAULT nextval('public."tbl_bin_pure_gold_Gold_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_bin_sales_return ALTER COLUMN "Return_ID" SET DEFAULT nextval('public."tbl_bin_sales_return_Return_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_catalog_wishlist ALTER COLUMN "Wishlist_ID" SET DEFAULT nextval('public."tbl_catalog_wishlist_Wishlist_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_mobile_otp ALTER COLUMN "OTP_ID" SET DEFAULT nextval('public."tbl_mobile_otp_OTP_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_scheme_accounting_entries ALTER COLUMN "Entry_ID" SET DEFAULT nextval('public."tbl_scheme_accounting_entries_Entry_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_tenant_app_config ALTER COLUMN "Config_ID" SET DEFAULT nextval('public."tbl_tenant_app_config_Config_ID_seq"'::regclass);



ALTER TABLE ONLY public.tbl_voucher_master ALTER COLUMN "Voucher_PK" SET DEFAULT nextval('public."tbl_voucher_master_Voucher_PK_seq"'::regclass);



ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_pkey PRIMARY KEY ("Entry_ID");



ALTER TABLE ONLY public.tbl_accounting_journal
    ADD CONSTRAINT tbl_accounting_journal_journal_number_unique UNIQUE ("Journal_Number");



ALTER TABLE ONLY public.tbl_accounting_journal
    ADD CONSTRAINT tbl_accounting_journal_pkey PRIMARY KEY ("Journal_ID");



ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_agent_code_unique UNIQUE ("Agent_Code");



ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_pkey PRIMARY KEY ("Agent_ID");



ALTER TABLE ONLY public.tbl_agent_master
    ADD CONSTRAINT tbl_agent_master_tenant_id_mobile_unique UNIQUE ("Tenant_ID", "Mobile");



ALTER TABLE ONLY public.tbl_bin_orders
    ADD CONSTRAINT tbl_bin_orders_pkey PRIMARY KEY ("Order_ID");



ALTER TABLE ONLY public.tbl_bin_orders
    ADD CONSTRAINT tbl_bin_orders_voucher_id_unique UNIQUE ("Voucher_ID");



ALTER TABLE ONLY public.tbl_bin_purchase
    ADD CONSTRAINT tbl_bin_purchase_pkey PRIMARY KEY ("Bin_ID");



ALTER TABLE ONLY public.tbl_bin_purchase
    ADD CONSTRAINT tbl_bin_purchase_voucher_id_unique UNIQUE ("Voucher_ID");



ALTER TABLE ONLY public.tbl_bin_pure_gold
    ADD CONSTRAINT tbl_bin_pure_gold_pkey PRIMARY KEY ("Gold_ID");



ALTER TABLE ONLY public.tbl_bin_pure_gold
    ADD CONSTRAINT tbl_bin_pure_gold_voucher_id_unique UNIQUE ("Voucher_ID");



ALTER TABLE ONLY public.tbl_bin_sales_return
    ADD CONSTRAINT tbl_bin_sales_return_pkey PRIMARY KEY ("Return_ID");



ALTER TABLE ONLY public.tbl_bin_sales_return
    ADD CONSTRAINT tbl_bin_sales_return_voucher_id_unique UNIQUE ("Voucher_ID");



ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_pkey PRIMARY KEY ("Wishlist_ID");



ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_tenant_id_article_number_customer_mobile_u UNIQUE ("Tenant_ID", "Article_Number", "Customer_Mobile");



ALTER TABLE ONLY public.tbl_mobile_otp
    ADD CONSTRAINT tbl_mobile_otp_pkey PRIMARY KEY ("OTP_ID");



ALTER TABLE ONLY public.tbl_scheme_accounting_entries
    ADD CONSTRAINT tbl_scheme_accounting_entries_pkey PRIMARY KEY ("Entry_ID");



ALTER TABLE ONLY public.tbl_tenant_app_config
    ADD CONSTRAINT tbl_tenant_app_config_pkey PRIMARY KEY ("Config_ID");



ALTER TABLE ONLY public.tbl_tenant_app_config
    ADD CONSTRAINT tbl_tenant_app_config_tenant_id_unique UNIQUE ("Tenant_ID");



ALTER TABLE ONLY public.tbl_voucher_master
    ADD CONSTRAINT tbl_voucher_master_pkey PRIMARY KEY ("Voucher_PK");



ALTER TABLE ONLY public.tbl_voucher_master
    ADD CONSTRAINT tbl_voucher_master_voucher_id_unique UNIQUE ("Voucher_ID");



CREATE INDEX idx_accounting_entries_data_mode ON public.tbl_accounting_entries USING btree ("Data_Mode");



CREATE INDEX idx_accounting_journal_data_mode ON public.tbl_accounting_journal USING btree ("Data_Mode");



CREATE INDEX idx_acct_entries_journal ON public.tbl_accounting_entries USING btree ("Journal_ID");



CREATE INDEX idx_binord_status ON public.tbl_bin_orders USING btree ("Status");



CREATE INDEX idx_binord_tid ON public.tbl_bin_orders USING btree ("Tenant_ID");



CREATE INDEX idx_binpg_tid ON public.tbl_bin_pure_gold USING btree ("Tenant_ID");



CREATE INDEX idx_binpur_status ON public.tbl_bin_purchase USING btree ("Status");



CREATE INDEX idx_binpur_tid ON public.tbl_bin_purchase USING btree ("Tenant_ID");



CREATE INDEX idx_binsrb_tid ON public.tbl_bin_sales_return USING btree ("Tenant_ID");



CREATE INDEX idx_otp_mobile ON public.tbl_mobile_otp USING btree ("Mobile");



CREATE INDEX idx_voucher_tid ON public.tbl_voucher_master USING btree ("Tenant_ID");



ALTER TABLE ONLY public.tbl_accounting_entries
    ADD CONSTRAINT tbl_accounting_entries_journal_id_foreign FOREIGN KEY ("Journal_ID") REFERENCES public.tbl_accounting_journal("Journal_ID") ON DELETE CASCADE;



ALTER TABLE ONLY public.tbl_catalog_wishlist
    ADD CONSTRAINT tbl_catalog_wishlist_ornament_id_foreign FOREIGN KEY ("Ornament_ID") REFERENCES public.tbl_ornament_master("Ornament_ID") ON DELETE CASCADE;
  `);
};

exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS tbl_accounting_entries CASCADE;
    DROP TABLE IF EXISTS tbl_accounting_journal CASCADE;
    DROP TABLE IF EXISTS tbl_agent_master CASCADE;
    DROP TABLE IF EXISTS tbl_bin_orders CASCADE;
    DROP TABLE IF EXISTS tbl_bin_purchase CASCADE;
    DROP TABLE IF EXISTS tbl_bin_pure_gold CASCADE;
    DROP TABLE IF EXISTS tbl_bin_sales_return CASCADE;
    DROP TABLE IF EXISTS tbl_catalog_wishlist CASCADE;
    DROP TABLE IF EXISTS tbl_mobile_otp CASCADE;
    DROP TABLE IF EXISTS tbl_scheme_accounting_entries CASCADE;
    DROP TABLE IF EXISTS tbl_tenant_app_config CASCADE;
    DROP TABLE IF EXISTS tbl_voucher_master CASCADE;
  `);
};
