-- ============================================================================
-- Jewellery ERP — Local (MySQL 8 / InnoDB) schema — SINGLE-TENANT
-- ============================================================================
-- Auto-generated from postgres_cloud_schema.sql by pg_to_mysql.js — do not
-- hand-edit; regenerate after changing the Postgres schema instead.
--
-- Differences from the cloud schema: Tenant_ID column removed from every
-- table (one shop == one database locally); SaaS control-plane-only tables
-- dropped entirely (tenant/license/module-registry tables — meaningless
-- without multi-tenancy). Branch_ID is kept: a single business can still
-- run multiple branches against one local database.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `tbl_accounting_entries`;
CREATE TABLE `tbl_accounting_entries` (
  `Entry_ID` INT NOT NULL AUTO_INCREMENT,
  `Journal_ID` INT,
  `Ledger_Account` VARCHAR(100) NOT NULL,
  `Account_Type` VARCHAR(30),
  `Entry_Type` VARCHAR(10) NOT NULL,
  `Amount` DECIMAL(15,2) NOT NULL,
  `Narration` VARCHAR(300),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Entry_Date` DATE,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Entry_ID`),
  UNIQUE KEY `tbl_accounting_entries_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_accounting_entries_data_mode` (`Data_Mode`),
  KEY `idx_acct_entries_journal` (`Journal_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_accounting_journal`;
CREATE TABLE `tbl_accounting_journal` (
  `Journal_ID` INT NOT NULL AUTO_INCREMENT,
  `Journal_Number` VARCHAR(60),
  `Entry_Date` DATE NOT NULL,
  `Source_Type` VARCHAR(30) NOT NULL,
  `Source_ID` INT,
  `Reference` VARCHAR(100),
  `Narration` TEXT,
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Journal_ID`),
  UNIQUE KEY `tbl_accounting_journal_journal_number_unique` (`Journal_Number`),
  UNIQUE KEY `tbl_accounting_journal_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_accounting_journal_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_agent_commission_transactions`;
CREATE TABLE `tbl_agent_commission_transactions` (
  `Txn_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Agent_ID` INT NOT NULL,
  `Source_Type` VARCHAR(20) NOT NULL,
  `Source_ID` BIGINT NOT NULL,
  `Commission_Base_Amount` DECIMAL(15,2) NOT NULL,
  `Commission_Pct_Applied` DECIMAL(5,2) NOT NULL,
  `Commission_Amount` DECIMAL(10,2) NOT NULL,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Paid_Date` DATE,
  `Payment_Reference` VARCHAR(50),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_agent_commission_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_agent_commission_source` (`Source_Type`, `Source_ID`),
  KEY `idx_agent_commission_status` (`Agent_ID`, `Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_agent_master`;
CREATE TABLE `tbl_agent_master` (
  `Agent_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(50),
  `Agent_Code` VARCHAR(30) NOT NULL,
  `Agent_Name` VARCHAR(100) NOT NULL,
  `Mobile` VARCHAR(20) NOT NULL,
  `Email` VARCHAR(100),
  `Address` VARCHAR(300),
  `Status` VARCHAR(10) DEFAULT 'Active',
  `Commission_Pct` DECIMAL(5,2) DEFAULT '0',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Agent_ID`),
  UNIQUE KEY `tbl_agent_master_agent_code_unique` (`Agent_Code`),
  UNIQUE KEY `tbl_agent_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_agent_master_tenant_id_mobile_unique` (`Mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_amc_enrollment`;
CREATE TABLE `tbl_amc_enrollment` (
  `Enrollment_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Customer_ID` INT,
  `Plan_ID` INT,
  `Ornament_ID` BIGINT,
  `Sale_ID` BIGINT,
  `Start_Date` DATE NOT NULL,
  `Expiry_Date` DATE NOT NULL,
  `Amount_Paid` DECIMAL(10,2) NOT NULL,
  `Last_Service_Date` DATE,
  `Services_Used` INT DEFAULT 0,
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Enrollment_ID`),
  UNIQUE KEY `tbl_amc_enrollment_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_amc_enrollment_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_amc_plan_master`;
CREATE TABLE `tbl_amc_plan_master` (
  `Plan_ID` INT NOT NULL AUTO_INCREMENT,
  `Plan_Name` VARCHAR(100) NOT NULL,
  `Duration_Months` INT NOT NULL DEFAULT 12,
  `Amount` DECIMAL(10,2) NOT NULL,
  `Free_Services_Included` INT DEFAULT 1,
  `Coverage_Details` TEXT,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Plan_ID`),
  UNIQUE KEY `tbl_amc_plan_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_approval_issue_header`;
CREATE TABLE `tbl_approval_issue_header` (
  `Issue_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Voucher_Number` VARCHAR(40) NOT NULL,
  `Party_ID` BIGINT,
  `Issue_Date` DATE NOT NULL,
  `Expected_Return_Date` DATE,
  `Total_Items_Issued` INT NOT NULL DEFAULT 0,
  `Total_Weight_Issued` DECIMAL(10,3) DEFAULT '0',
  `Total_Value_Issued` DECIMAL(15,2) DEFAULT '0',
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_By` VARCHAR(50),
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Cancelled_By` VARCHAR(50),
  `Cancelled_Date` DATETIME,
  `Cancellation_Reason` TEXT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Issue_ID`),
  UNIQUE KEY `tbl_approval_issue_header_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_approval_issue_header_voucher_number_unique` (`Voucher_Number`),
  KEY `idx_approval_issue_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_approval_issue_items`;
CREATE TABLE `tbl_approval_issue_items` (
  `Issue_Item_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Issue_ID` BIGINT NOT NULL,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50),
  `Gross_Weight` DECIMAL(10,3),
  `Net_Gold_Weight` DECIMAL(10,3),
  `Purity_Code` VARCHAR(20),
  `Approx_Value` DECIMAL(15,2),
  `Item_Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Received_In_Receive_ID` BIGINT,
  `Received_Date` DATETIME,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Issue_Item_ID`),
  UNIQUE KEY `tbl_approval_issue_items_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_approval_issue_items_ornament` (`Ornament_ID`),
  KEY `idx_approval_issue_items_status` (`Issue_ID`, `Item_Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_approval_party_master`;
CREATE TABLE `tbl_approval_party_master` (
  `Party_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Party_Name` VARCHAR(150) NOT NULL,
  `Shop_Name` VARCHAR(150),
  `Contact_Person` VARCHAR(100),
  `Mobile` VARCHAR(15),
  `Alt_Mobile` VARCHAR(15),
  `GST_Number` VARCHAR(20),
  `Address` TEXT,
  `City` VARCHAR(100),
  `Remarks` TEXT,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_By` VARCHAR(50),
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Party_ID`),
  UNIQUE KEY `tbl_approval_party_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_approval_party_master_tenant_id_mobile_unique` (`Mobile`),
  KEY `idx_approval_party_name` (`Party_Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_approval_receive_header`;
CREATE TABLE `tbl_approval_receive_header` (
  `Receive_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Voucher_Number` VARCHAR(40) NOT NULL,
  `Issue_ID` BIGINT NOT NULL,
  `Receive_Date` DATE NOT NULL,
  `Items_Received_Count` INT NOT NULL DEFAULT 0,
  `Total_Weight_Received` DECIMAL(10,3) DEFAULT '0',
  `Total_Value_Received` DECIMAL(15,2) DEFAULT '0',
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Receive_ID`),
  UNIQUE KEY `tbl_approval_receive_header_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_approval_receive_header_voucher_number_unique` (`Voucher_Number`),
  KEY `idx_approval_receive_date` (`Receive_Date`),
  KEY `idx_approval_receive_issue` (`Issue_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_attendance`;
CREATE TABLE `tbl_attendance` (
  `Attendance_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `User_ID` INT NOT NULL,
  `Attendance_Date` DATE NOT NULL,
  `Check_In` TIME,
  `Check_Out` TIME,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Present',
  `Source` VARCHAR(20) DEFAULT 'Manual',
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Attendance_ID`),
  UNIQUE KEY `tbl_attendance_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_attendance_user_id_attendance_date_unique` (`User_ID`, `Attendance_Date`),
  KEY `idx_attendance_date` (`Attendance_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_audit_log`;
CREATE TABLE `tbl_audit_log` (
  `Log_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `User_ID` INT,
  `Table_Name` VARCHAR(50),
  `Record_ID` VARCHAR(50),
  `Action_Type` VARCHAR(20),
  `Old_Data` JSON,
  `New_Data` JSON,
  `IP_Address` VARCHAR(50),
  `Browser_Info` VARCHAR(200),
  `Action_Timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Username` VARCHAR(100),
  `Full_Name` VARCHAR(200),
  `Branch_ID` VARCHAR(50),
  `Description` TEXT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Log_ID`),
  UNIQUE KEY `tbl_audit_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_audit_action` (`Action_Type`),
  KEY `idx_audit_table` (`Table_Name`, `Record_ID`),
  KEY `idx_audit_tenant_date` (`Action_Timestamp`),
  KEY `idx_audit_ts` (`Action_Timestamp`),
  KEY `idx_audit_user` (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bank_account_master`;
CREATE TABLE `tbl_bank_account_master` (
  `Account_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Bank_Name` VARCHAR(100) NOT NULL,
  `Account_Name` VARCHAR(100),
  `Account_Number` VARCHAR(30) NOT NULL,
  `IFSC_Code` VARCHAR(20),
  `Account_Type` VARCHAR(20) DEFAULT 'Current',
  `Opening_Balance` DECIMAL(15,2) DEFAULT '0',
  `Current_Balance` DECIMAL(15,2) DEFAULT '0',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Account_ID`),
  UNIQUE KEY `tbl_bank_account_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_bank_account_master_tenant_id_account_number_unique` (`Account_Number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bin_orders`;
CREATE TABLE `tbl_bin_orders` (
  `Order_ID` INT NOT NULL AUTO_INCREMENT,
  `Voucher_ID` VARCHAR(50) NOT NULL,
  `Branch_ID` VARCHAR(50),
  `Order_Date` DATE NOT NULL,
  `Order_Type` VARCHAR(20) DEFAULT 'Customer',
  `Party_Name` VARCHAR(100) NOT NULL,
  `Party_Mobile` VARCHAR(20),
  `Party_ID` INT,
  `Item_Description` TEXT,
  `Design_Details` VARCHAR(200),
  `Purity` VARCHAR(20),
  `Estimated_Weight` DECIMAL(10,3),
  `Actual_Weight` DECIMAL(10,3),
  `Due_Date` DATE,
  `Estimated_Amount` DECIMAL(14,2) DEFAULT '0',
  `Advance_Amount` DECIMAL(14,2) DEFAULT '0',
  `Payment_Mode` VARCHAR(30),
  `Assigned_Karigar_ID` INT,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Remarks` TEXT,
  `Ornament_ID` INT,
  `Data_Mode` SMALLINT DEFAULT '3',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Order_ID`),
  UNIQUE KEY `tbl_bin_orders_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_bin_orders_voucher_id_unique` (`Voucher_ID`),
  KEY `idx_binord_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bin_purchase`;
CREATE TABLE `tbl_bin_purchase` (
  `Bin_ID` INT NOT NULL AUTO_INCREMENT,
  `Voucher_ID` VARCHAR(50) NOT NULL,
  `Branch_ID` VARCHAR(50),
  `Purchase_Date` DATE NOT NULL,
  `Source_Type` VARCHAR(20) DEFAULT 'Supplier',
  `Supplier_ID` INT,
  `Supplier_Name` VARCHAR(100) NOT NULL,
  `Supplier_Mobile` VARCHAR(20),
  `Item_Category` VARCHAR(100),
  `Design_Name` VARCHAR(100),
  `Purity` VARCHAR(20),
  `Gross_Weight` DECIMAL(10,3) DEFAULT '0',
  `Net_Weight` DECIMAL(10,3) DEFAULT '0',
  `Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Stone_Details` TEXT,
  `Purchase_Rate` DECIMAL(12,2) DEFAULT '0',
  `Purchase_Amount` DECIMAL(14,2) DEFAULT '0',
  `Making_Charge` DECIMAL(12,2) DEFAULT '0',
  `Invoice_Number` VARCHAR(50),
  `Remarks` TEXT,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Inspected_By` VARCHAR(100),
  `Inspected_At` DATETIME,
  `Approved_By` VARCHAR(100),
  `Approved_At` DATETIME,
  `Ornament_ID` INT,
  `Article_Number` VARCHAR(50),
  `Data_Mode` SMALLINT DEFAULT '3',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Bin_ID`),
  UNIQUE KEY `tbl_bin_purchase_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_bin_purchase_voucher_id_unique` (`Voucher_ID`),
  KEY `idx_binpur_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bin_pure_gold`;
CREATE TABLE `tbl_bin_pure_gold` (
  `Gold_ID` INT NOT NULL AUTO_INCREMENT,
  `Voucher_ID` VARCHAR(50) NOT NULL,
  `Branch_ID` VARCHAR(50),
  `Purchase_Date` DATE NOT NULL,
  `Supplier_ID` INT,
  `Supplier_Name` VARCHAR(100) NOT NULL,
  `Gold_Type` VARCHAR(30) DEFAULT 'Bar',
  `Piece_Number` VARCHAR(50),
  `Purity` VARCHAR(10) DEFAULT '24K',
  `Gross_Weight` DECIMAL(10,3) NOT NULL,
  `Net_Weight` DECIMAL(10,3) NOT NULL,
  `Purchase_Rate` DECIMAL(12,2) DEFAULT '0',
  `Purchase_Amount` DECIMAL(14,2) DEFAULT '0',
  `Storage_Location` VARCHAR(100),
  `Remarks` TEXT,
  `Status` VARCHAR(20) DEFAULT 'Holding',
  `Disposed_By` VARCHAR(30),
  `Disposed_At` DATETIME,
  `Data_Mode` SMALLINT DEFAULT '3',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Gold_ID`),
  UNIQUE KEY `tbl_bin_pure_gold_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_bin_pure_gold_voucher_id_unique` (`Voucher_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bin_sales_return`;
CREATE TABLE `tbl_bin_sales_return` (
  `Return_ID` INT NOT NULL AUTO_INCREMENT,
  `Voucher_ID` VARCHAR(50) NOT NULL,
  `Branch_ID` VARCHAR(50),
  `Return_Date` DATE NOT NULL,
  `Original_Invoice_Number` VARCHAR(50),
  `Original_Sale_ID` INT,
  `Customer_Name` VARCHAR(100) NOT NULL,
  `Customer_Mobile` VARCHAR(20),
  `Customer_ID` INT,
  `Item_Description` VARCHAR(200),
  `Item_Category` VARCHAR(100),
  `Purity` VARCHAR(20),
  `Gross_Weight` DECIMAL(10,3) DEFAULT '0',
  `Net_Weight` DECIMAL(10,3) DEFAULT '0',
  `Return_Reason` VARCHAR(50) DEFAULT 'Design',
  `Return_Notes` TEXT,
  `Inspection_Status` VARCHAR(20) DEFAULT 'Pending',
  `Inspected_By` VARCHAR(100),
  `Inspected_At` DATETIME,
  `Refund_Mode` VARCHAR(30),
  `Refund_Amount` DECIMAL(14,2) DEFAULT '0',
  `Status` VARCHAR(20) DEFAULT 'Received',
  `New_Ornament_ID` INT,
  `New_Article_Number` VARCHAR(50),
  `Data_Mode` SMALLINT DEFAULT '3',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Return_ID`),
  UNIQUE KEY `tbl_bin_sales_return_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_bin_sales_return_voucher_id_unique` (`Voucher_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bom_department_stages`;
CREATE TABLE `tbl_bom_department_stages` (
  `Stage_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `BOM_ID` INT NOT NULL,
  `Dept_ID` INT NOT NULL,
  `Sequence_No` INT NOT NULL DEFAULT 1,
  `Standard_Wastage_Pct` DECIMAL(5,2) DEFAULT '0',
  `Standard_Labour_Rate` DECIMAL(10,2),
  `Standard_Time_Minutes` INT,
  PRIMARY KEY (`Stage_ID`),
  KEY `idx_bom_stages_bom` (`BOM_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_bom_master`;
CREATE TABLE `tbl_bom_master` (
  `BOM_ID` INT NOT NULL AUTO_INCREMENT,
  `Design_ID` INT,
  `Type_ID` INT,
  `BOM_Name` VARCHAR(100) NOT NULL,
  `Version` INT DEFAULT 1,
  `Standard_Gold_Weight` DECIMAL(10,3),
  `Standard_Stone_Weight` DECIMAL(10,3),
  `Standard_Wastage_Pct` DECIMAL(5,2) DEFAULT '3',
  `Standard_Labour_Amount` DECIMAL(10,2),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`BOM_ID`),
  UNIQUE KEY `tbl_bom_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_branch_master`;
CREATE TABLE `tbl_branch_master` (
  `Branch_ID` VARCHAR(20) NOT NULL,
  `Branch_Name` VARCHAR(100) NOT NULL,
  `Branch_Code` VARCHAR(10) NOT NULL,
  `Address_Line1` VARCHAR(200),
  `Address_Line2` VARCHAR(200),
  `City` VARCHAR(50),
  `State` VARCHAR(50),
  `Pincode` VARCHAR(10),
  `Phone` VARCHAR(20),
  `Email` VARCHAR(100),
  `GST_No` VARCHAR(20),
  `Is_Head_Office` TINYINT(1) DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Opening_Date` DATE,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Branch_ID`),
  UNIQUE KEY `tbl_branch_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_brand_master`;
CREATE TABLE `tbl_brand_master` (
  `Brand_ID` INT NOT NULL AUTO_INCREMENT,
  `Brand_Code` VARCHAR(30) NOT NULL,
  `Brand_Name` VARCHAR(100) NOT NULL,
  `Logo_URL` VARCHAR(500),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Brand_ID`),
  UNIQUE KEY `tbl_brand_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_brand_master_tenant_id_brand_code_unique` (`Brand_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_card_charges_master`;
CREATE TABLE `tbl_card_charges_master` (
  `Charge_ID` INT NOT NULL AUTO_INCREMENT,
  `Card_Type` VARCHAR(20) NOT NULL,
  `Card_Network` VARCHAR(20),
  `Surcharge_Pct` DECIMAL(5,2) DEFAULT '0',
  `Min_Surcharge_Amount` DECIMAL(10,2) DEFAULT '0',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Charge_ID`),
  UNIQUE KEY `tbl_card_charges_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_catalog_order_items`;
CREATE TABLE `tbl_catalog_order_items` (
  `Item_ID` INT NOT NULL AUTO_INCREMENT,
  `Order_ID` INT,
  `Article_Number` VARCHAR(50) NOT NULL,
  `Quantity` INT DEFAULT 1,
  `Notes` TEXT,
  PRIMARY KEY (`Item_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_catalog_orders`;
CREATE TABLE `tbl_catalog_orders` (
  `Order_ID` INT NOT NULL AUTO_INCREMENT,
  `Order_Number` VARCHAR(50),
  `Customer_Name` VARCHAR(100),
  `Customer_Mobile` VARCHAR(20),
  `Notes` TEXT,
  `Status` VARCHAR(30) DEFAULT 'Pending',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Order_ID`),
  UNIQUE KEY `tbl_catalog_orders_order_number_unique` (`Order_Number`),
  UNIQUE KEY `tbl_catalog_orders_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_catalog_wishlist`;
CREATE TABLE `tbl_catalog_wishlist` (
  `Wishlist_ID` INT NOT NULL AUTO_INCREMENT,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50) NOT NULL,
  `Customer_Mobile` VARCHAR(20),
  `Customer_ID` INT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Wishlist_ID`),
  UNIQUE KEY `tbl_catalog_wishlist_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_catalog_wishlist_tenant_id_article_number_customer_mobile_u` (`Article_Number`, `Customer_Mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_cheque_register`;
CREATE TABLE `tbl_cheque_register` (
  `Cheque_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Account_ID` INT,
  `Cheque_Type` VARCHAR(10) NOT NULL,
  `Party_Type` VARCHAR(20),
  `Party_Name` VARCHAR(100) NOT NULL,
  `Cheque_Number` VARCHAR(50) NOT NULL,
  `Bank_Name` VARCHAR(100),
  `Cheque_Date` DATE NOT NULL,
  `Amount` DECIMAL(15,2) NOT NULL,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Deposit_Date` DATE,
  `Clearing_Date` DATE,
  `Bounce_Charge` DECIMAL(10,2) DEFAULT '0',
  `Reference_Voucher_ID` VARCHAR(50),
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Cheque_ID`),
  UNIQUE KEY `tbl_cheque_register_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_cheque_register_number` (`Cheque_Number`),
  KEY `idx_cheque_register_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_collection_master`;
CREATE TABLE `tbl_collection_master` (
  `Collection_ID` INT NOT NULL AUTO_INCREMENT,
  `Collection_Code` VARCHAR(30) NOT NULL,
  `Collection_Name` VARCHAR(100) NOT NULL,
  `Season` VARCHAR(50),
  `Year` VARCHAR(10),
  `Description` TEXT,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Collection_ID`),
  UNIQUE KEY `tbl_collection_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_collection_master_tenant_id_collection_code_unique` (`Collection_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_counter_master`;
CREATE TABLE `tbl_counter_master` (
  `Counter_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20) NOT NULL,
  `Floor_ID` INT NOT NULL,
  `Counter_Code` VARCHAR(20) NOT NULL,
  `Counter_Name` VARCHAR(100) NOT NULL,
  `Counter_Type` VARCHAR(30) DEFAULT 'Showcase',
  `Capacity` INT DEFAULT 50,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Counter_ID`),
  UNIQUE KEY `tbl_counter_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_counter_master_tenant_id_branch_id_floor_id_counter_code_un` (`Branch_ID`, `Floor_ID`, `Counter_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_crm_followup`;
CREATE TABLE `tbl_crm_followup` (
  `Followup_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Lead_ID` BIGINT,
  `Customer_ID` INT,
  `Followup_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Next_Followup_Date` DATE,
  `Contact_Mode` VARCHAR(20),
  `Remarks` TEXT NOT NULL,
  `Done_By` INT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Followup_ID`),
  UNIQUE KEY `tbl_crm_followup_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_crm_followup_customer` (`Customer_ID`),
  KEY `idx_crm_followup_lead` (`Lead_ID`),
  KEY `idx_crm_followup_next` (`Next_Followup_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_crm_lead`;
CREATE TABLE `tbl_crm_lead` (
  `Lead_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Lead_Name` VARCHAR(100) NOT NULL,
  `Mobile` VARCHAR(15) NOT NULL,
  `Email` VARCHAR(100),
  `Source` VARCHAR(30) DEFAULT 'Walk-in',
  `Interested_In` VARCHAR(200),
  `Assigned_To` INT,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'New',
  `Converted_Customer_ID` INT,
  `Converted_Date` DATE,
  `Lost_Reason` VARCHAR(200),
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Lead_ID`),
  UNIQUE KEY `tbl_crm_lead_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_crm_lead_mobile` (`Mobile`),
  KEY `idx_crm_lead_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_custom_order`;
CREATE TABLE `tbl_custom_order` (
  `Order_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Order_Number` VARCHAR(30) NOT NULL,
  `Order_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Customer_ID` INT,
  `Customer_Name` VARCHAR(100),
  `Customer_Mobile` VARCHAR(15),
  `Item_Description` TEXT,
  `Estimated_Weight` DECIMAL(10,3),
  `Estimated_Amount` DECIMAL(15,2),
  `Advance_Amount` DECIMAL(15,2) DEFAULT '0',
  `Expected_Delivery` DATE,
  `Assigned_Karigar_ID` INT,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Order_ID`),
  UNIQUE KEY `tbl_custom_order_order_number_unique` (`Order_Number`),
  UNIQUE KEY `tbl_custom_order_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_customer_display_settings`;
CREATE TABLE `tbl_customer_display_settings` (
  `Setting_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Display_Logo` TINYINT(1) DEFAULT 1,
  `Logo_URL` VARCHAR(500),
  `Show_Item_Image` TINYINT(1) DEFAULT 1,
  `Show_Gold_Rate_Live` TINYINT(1) DEFAULT 1,
  `Show_Customer_Name` TINYINT(1) DEFAULT 1,
  `Show_Customer_Photo` TINYINT(1) DEFAULT 0,
  `Show_Cost_Price` TINYINT(1) DEFAULT 0,
  `Show_Making_Charge_Individual` TINYINT(1) DEFAULT 1,
  `Show_Total_Weight_Only` TINYINT(1) DEFAULT 0,
  `Show_Discount_Line` TINYINT(1) DEFAULT 1,
  `Show_QR_Code` TINYINT(1) DEFAULT 1,
  `Show_UPI_QR` TINYINT(1) DEFAULT 1,
  `Background_Color` VARCHAR(7) DEFAULT '#1A1A1A',
  `Text_Color` VARCHAR(7) DEFAULT '#FFFFFF',
  `Accent_Color` VARCHAR(7) DEFAULT '#FFD700',
  `Font_Scale_Factor` DECIMAL(3,2) DEFAULT '1',
  `Font_Family` VARCHAR(50) DEFAULT 'Arial',
  `Header_Message` VARCHAR(200) DEFAULT 'Welcome',
  `Footer_Message` VARCHAR(200) DEFAULT '100% BIS Hallmarked Gold',
  `Auto_Clear_After_Seconds` INT DEFAULT 10,
  `Auto_Refresh_Interval` INT DEFAULT 1,
  `Show_Slideshow_When_Idle` TINYINT(1) DEFAULT 1,
  `Slideshow_Image_URLs` JSON,
  `Slideshow_Interval` INT DEFAULT 5,
  `Is_Keyboard_Blocked` TINYINT(1) DEFAULT 1,
  `Is_Mouse_Blocked` TINYINT(1) DEFAULT 1,
  `Is_Print_Blocked` TINYINT(1) DEFAULT 1,
  `Screen_Resolution_Width` INT DEFAULT 1920,
  `Screen_Resolution_Height` INT DEFAULT 1080,
  `Is_Fullscreen` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Updated_By` VARCHAR(50),
  `Last_Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Setting_ID`),
  UNIQUE KEY `tbl_customer_display_settings_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_customer_feedback`;
CREATE TABLE `tbl_customer_feedback` (
  `Feedback_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Customer_ID` INT,
  `Sale_ID` BIGINT,
  `Rating` INT NOT NULL,
  `Comments` TEXT,
  `Feedback_Type` VARCHAR(30) DEFAULT 'General',
  `Status` VARCHAR(20) DEFAULT 'Open',
  `Resolution_Notes` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Feedback_ID`),
  UNIQUE KEY `tbl_customer_feedback_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_customer_feedback_customer` (`Customer_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_customer_insurance`;
CREATE TABLE `tbl_customer_insurance` (
  `Insurance_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Customer_ID` INT,
  `Sale_ID` BIGINT,
  `Ornament_ID` BIGINT,
  `Policy_ID` INT,
  `Certificate_Number` VARCHAR(50),
  `Sum_Insured` DECIMAL(15,2) NOT NULL,
  `Premium_Amount` DECIMAL(15,2) NOT NULL,
  `Start_Date` DATE NOT NULL,
  `Expiry_Date` DATE NOT NULL,
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Claim_Date` DATE,
  `Claim_Amount` DECIMAL(15,2),
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Insurance_ID`),
  UNIQUE KEY `tbl_customer_insurance_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_customer_insurance_customer` (`Customer_ID`),
  KEY `idx_customer_insurance_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_customer_master`;
CREATE TABLE `tbl_customer_master` (
  `Customer_ID` INT NOT NULL AUTO_INCREMENT,
  `Customer_Code` VARCHAR(30) NOT NULL,
  `Customer_Name` VARCHAR(100) NOT NULL,
  `Mobile_1` VARCHAR(15) NOT NULL,
  `Mobile_2` VARCHAR(15),
  `Email` VARCHAR(100),
  `Date_Of_Birth` DATE,
  `Anniversary_Date` DATE,
  `Occupation` VARCHAR(50),
  `Income_Group` VARCHAR(20),
  `Address_Line1` VARCHAR(200),
  `Address_Line2` VARCHAR(200),
  `City` VARCHAR(50),
  `State` VARCHAR(50),
  `Pincode` VARCHAR(10),
  `GST_No` VARCHAR(20),
  `PAN_No` VARCHAR(20),
  `Loyalty_Points` DECIMAL(10,2) DEFAULT '0',
  `Total_Purchase_Value` DECIMAL(15,2) DEFAULT '0',
  `Total_Purchase_Count` INT DEFAULT 0,
  `Last_Purchase_Date` DATE,
  `Preferred_Type` VARCHAR(30),
  `Preferred_Purity` VARCHAR(10),
  `Family_Member_1_Name` VARCHAR(100),
  `Family_Member_1_Relation` VARCHAR(20),
  `Family_Member_2_Name` VARCHAR(100),
  `Family_Member_2_Relation` VARCHAR(20),
  `Referred_By` VARCHAR(100),
  `Is_Wholesale` TINYINT(1) DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Notes` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Customer_ID`),
  UNIQUE KEY `tbl_customer_master_customer_code_unique` (`Customer_Code`),
  UNIQUE KEY `tbl_customer_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_customer_master_tenant_id_mobile_1_unique` (`Mobile_1`),
  KEY `idx_customer_master_data_mode` (`Data_Mode`),
  KEY `idx_customer_mobile` (`Mobile_1`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_day_close`;
CREATE TABLE `tbl_day_close` (
  `Close_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Close_Date` DATE NOT NULL,
  `Opening_Cash` DECIMAL(15,2) DEFAULT '0',
  `Cash_Sales` DECIMAL(15,2) DEFAULT '0',
  `UPI_Sales` DECIMAL(15,2) DEFAULT '0',
  `Card_Sales` DECIMAL(15,2) DEFAULT '0',
  `Other_Sales` DECIMAL(15,2) DEFAULT '0',
  `Total_Sales` DECIMAL(15,2) DEFAULT '0',
  `Cash_Expenses` DECIMAL(15,2) DEFAULT '0',
  `Cash_In_Hand` DECIMAL(15,2) DEFAULT '0',
  `Verified_Cash` DECIMAL(15,2) DEFAULT '0',
  `Difference` DECIMAL(15,2) DEFAULT '0',
  `Status` VARCHAR(20) DEFAULT 'Open',
  `Closed_By` INT,
  `Closed_At` DATETIME,
  `Remarks` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Close_ID`),
  UNIQUE KEY `tbl_day_close_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_day_close_tenant_id_branch_id_close_date_unique` (`Branch_ID`, `Close_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_design_master`;
CREATE TABLE `tbl_design_master` (
  `Design_ID` INT NOT NULL AUTO_INCREMENT,
  `Type_ID` INT,
  `Design_Code` VARCHAR(30) NOT NULL,
  `Design_Name` VARCHAR(100) NOT NULL,
  `Collection_Name` VARCHAR(50),
  `Estimated_Gold_Weight` DECIMAL(10,3),
  `Estimated_Stone_Weight` DECIMAL(10,3),
  `Estimated_Making_Charge` DECIMAL(10,2),
  `Estimated_Wastage_Percent` DECIMAL(5,2),
  `Designer_Name` VARCHAR(50),
  `Category` VARCHAR(30),
  `Is_Custom_Only` TINYINT(1) DEFAULT 0,
  `Min_Order_Quantity` INT DEFAULT 1,
  `Image_URL` VARCHAR(500),
  `CAD_File_URL` VARCHAR(500),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Notes` TEXT,
  PRIMARY KEY (`Design_ID`),
  UNIQUE KEY `tbl_design_master_design_code_unique` (`Design_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_diamond_color_master`;
CREATE TABLE `tbl_diamond_color_master` (
  `Color_ID` INT NOT NULL AUTO_INCREMENT,
  `Color_Code` VARCHAR(10) NOT NULL,
  `Color_Name` VARCHAR(50) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Color_ID`),
  UNIQUE KEY `tbl_diamond_color_master_color_code_unique` (`Color_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_diamond_quality_master`;
CREATE TABLE `tbl_diamond_quality_master` (
  `Quality_ID` INT NOT NULL AUTO_INCREMENT,
  `Quality_Code` VARCHAR(20) NOT NULL,
  `Quality_Name` VARCHAR(50) NOT NULL,
  `Description` TEXT,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Quality_ID`),
  UNIQUE KEY `tbl_diamond_quality_master_quality_code_unique` (`Quality_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_diamond_shape_master`;
CREATE TABLE `tbl_diamond_shape_master` (
  `Shape_ID` INT NOT NULL AUTO_INCREMENT,
  `Shape_Code` VARCHAR(20) NOT NULL,
  `Shape_Name` VARCHAR(50) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Shape_ID`),
  UNIQUE KEY `tbl_diamond_shape_master_shape_code_unique` (`Shape_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_display_settings`;
CREATE TABLE `tbl_display_settings` (
  `Setting_ID` INT NOT NULL AUTO_INCREMENT,
  `Setting_Type` VARCHAR(20) NOT NULL,
  `Reference_ID` VARCHAR(50) NOT NULL,
  `Matrix_JSON` JSON NOT NULL,
  `Created_By` VARCHAR(100),
  `Updated_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Setting_ID`),
  UNIQUE KEY `tbl_display_settings_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_display_settings_tenant_id_setting_type_reference_id_unique` (`Setting_Type`, `Reference_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_einvoice_log`;
CREATE TABLE `tbl_einvoice_log` (
  `Log_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sale_ID` BIGINT NOT NULL,
  `IRN` VARCHAR(100),
  `Ack_Number` VARCHAR(50),
  `Ack_Date` DATETIME,
  `QR_Code_Data` TEXT,
  `Signed_Invoice_URL` VARCHAR(500),
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Error_Message` TEXT,
  `Cancelled_Date` DATETIME,
  `Cancellation_Reason` VARCHAR(200),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Log_ID`),
  UNIQUE KEY `tbl_einvoice_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_einvoice_log_sale` (`Sale_ID`),
  KEY `idx_einvoice_log_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_employee_details`;
CREATE TABLE `tbl_employee_details` (
  `User_ID` INT NOT NULL,
  `Date_Of_Birth` DATE,
  `Aadhaar_No` VARCHAR(20),
  `PAN_No` VARCHAR(20),
  `Bank_Account_No` VARCHAR(30),
  `IFSC_Code` VARCHAR(20),
  `Designation` VARCHAR(100),
  `Date_Of_Joining` DATE,
  `Date_Of_Leaving` DATE,
  `Emergency_Contact_Name` VARCHAR(100),
  `Emergency_Contact_Mobile` VARCHAR(15),
  `Address` TEXT,
  `Photo_URL` VARCHAR(500),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_floor_master`;
CREATE TABLE `tbl_floor_master` (
  `Floor_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20) NOT NULL,
  `Floor_Code` VARCHAR(20) NOT NULL,
  `Floor_Name` VARCHAR(100) NOT NULL,
  `Floor_Number` INT DEFAULT 0,
  `Description` VARCHAR(200),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Floor_ID`),
  UNIQUE KEY `tbl_floor_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_floor_master_tenant_id_branch_id_floor_code_unique` (`Branch_ID`, `Floor_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_gem_certificate`;
CREATE TABLE `tbl_gem_certificate` (
  `Certificate_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Ornament_ID` BIGINT,
  `Stone_ID` INT,
  `Certifying_Lab` VARCHAR(50) NOT NULL,
  `Certificate_Number` VARCHAR(50) NOT NULL,
  `Certificate_Date` DATE,
  `Carat_Weight` DECIMAL(10,3),
  `Color_Grade` VARCHAR(10),
  `Clarity_Grade` VARCHAR(10),
  `Cut_Grade` VARCHAR(20),
  `Certificate_URL` VARCHAR(500),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Certificate_ID`),
  UNIQUE KEY `tbl_gem_certificate_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_gem_certificate_tenant_id_certifying_lab_certificate_number` (`Certifying_Lab`, `Certificate_Number`),
  KEY `idx_gem_certificate_ornament` (`Ornament_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_gemstone_master`;
CREATE TABLE `tbl_gemstone_master` (
  `Stone_ID` INT NOT NULL AUTO_INCREMENT,
  `Stone_Code` VARCHAR(20) NOT NULL,
  `Stone_Name` VARCHAR(50) NOT NULL,
  `Stone_Color` VARCHAR(30),
  `Stone_Clarity` VARCHAR(20),
  `Stone_Cut` VARCHAR(20),
  `Stone_Carat_Weight` DECIMAL(10,3),
  `Price_Per_Carat` DECIMAL(15,2),
  `Supplier_ID` INT,
  `Certificate_No` VARCHAR(50),
  `Is_Natural` TINYINT(1) DEFAULT 1,
  `Is_Lab_Grown` TINYINT(1) DEFAULT 0,
  `Origin_Country` VARCHAR(50),
  `Image_URL` VARCHAR(500),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Notes` TEXT,
  PRIMARY KEY (`Stone_ID`),
  UNIQUE KEY `tbl_gemstone_master_stone_code_unique` (`Stone_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_gift_vouchers`;
CREATE TABLE `tbl_gift_vouchers` (
  `Voucher_ID` INT NOT NULL AUTO_INCREMENT,
  `Voucher_Code` VARCHAR(50) NOT NULL,
  `Voucher_Value` DECIMAL(10,2) NOT NULL,
  `Used_Amount` DECIMAL(10,2) DEFAULT '0',
  `Balance_Amount` DECIMAL(10,2) NOT NULL,
  `Issue_Date` DATE NOT NULL,
  `Expiry_Date` DATE,
  `Issued_To_Customer_ID` INT,
  `Used_In_Sale_ID` BIGINT,
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Voucher_ID`),
  UNIQUE KEY `tbl_gift_vouchers_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_gift_vouchers_voucher_code_unique` (`Voucher_Code`),
  KEY `idx_voucher_code` (`Voucher_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_gold_rate_history`;
CREATE TABLE `tbl_gold_rate_history` (
  `Rate_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Rate_Date` DATE NOT NULL,
  `Rate_22K` DECIMAL(10,2),
  `Rate_24K` DECIMAL(10,2),
  `Rate_18K` DECIMAL(10,2),
  `Rate_Silver` DECIMAL(10,2),
  `Rate_Platinum` DECIMAL(10,2),
  `Source` VARCHAR(20) DEFAULT 'Manual',
  `Set_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Rate_ID`),
  UNIQUE KEY `tbl_gold_rate_history_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_rate_date` (`Rate_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_hidden_location_master`;
CREATE TABLE `tbl_hidden_location_master` (
  `Hidden_Location_ID` INT NOT NULL AUTO_INCREMENT,
  `Location_Code` VARCHAR(20) NOT NULL,
  `Location_Name` VARCHAR(100) NOT NULL,
  `Description` VARCHAR(200),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Hidden_Location_ID`),
  UNIQUE KEY `tbl_hidden_location_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_hidden_location_master_tenant_id_location_code_unique` (`Location_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_holiday_master`;
CREATE TABLE `tbl_holiday_master` (
  `Holiday_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Holiday_Date` DATE NOT NULL,
  `Holiday_Name` VARCHAR(100) NOT NULL,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Holiday_ID`),
  UNIQUE KEY `tbl_holiday_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_holiday_master_tenant_id_branch_id_holiday_date_unique` (`Branch_ID`, `Holiday_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_hsn_master`;
CREATE TABLE `tbl_hsn_master` (
  `HSN_ID` INT NOT NULL AUTO_INCREMENT,
  `HSN_Code` VARCHAR(20) NOT NULL,
  `Description` VARCHAR(200),
  `GST_Percentage` DECIMAL(5,2) NOT NULL DEFAULT '3',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`HSN_ID`),
  UNIQUE KEY `tbl_hsn_master_hsn_code_unique` (`HSN_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_huid_master`;
CREATE TABLE `tbl_huid_master` (
  `HUID_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `HUID_Number` VARCHAR(50) NOT NULL,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50),
  `Purity_Code` VARCHAR(10),
  `Weight` DECIMAL(10,3),
  `Assay_Centre` VARCHAR(100),
  `Hallmark_Date` DATE,
  `Certificate_URL` VARCHAR(500),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`HUID_ID`),
  UNIQUE KEY `tbl_huid_master_huid_number_unique` (`HUID_Number`),
  UNIQUE KEY `tbl_huid_master_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_huid_number` (`HUID_Number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_incentive_slab_master`;
CREATE TABLE `tbl_incentive_slab_master` (
  `Slab_ID` INT NOT NULL AUTO_INCREMENT,
  `Slab_Name` VARCHAR(100) NOT NULL,
  `Amount_From` DECIMAL(15,2) NOT NULL,
  `Amount_To` DECIMAL(15,2),
  `Incentive_Pct` DECIMAL(5,2) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Slab_ID`),
  UNIQUE KEY `tbl_incentive_slab_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_insurance_policy_master`;
CREATE TABLE `tbl_insurance_policy_master` (
  `Policy_ID` INT NOT NULL AUTO_INCREMENT,
  `Insurer_Name` VARCHAR(100) NOT NULL,
  `Policy_Number` VARCHAR(50) NOT NULL,
  `Coverage_Type` VARCHAR(30),
  `Premium_Rate_Pct` DECIMAL(5,2),
  `Premium_Slab_Rules` JSON,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Policy_ID`),
  UNIQUE KEY `tbl_insurance_policy_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_invoice_preview_data`;
CREATE TABLE `tbl_invoice_preview_data` (
  `Preview_ID` INT NOT NULL AUTO_INCREMENT,
  `Document_Type` VARCHAR(40) NOT NULL,
  `Sample_Data` JSON NOT NULL,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Preview_ID`),
  UNIQUE KEY `tbl_invoice_preview_data_document_type_unique` (`Document_Type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_invoice_studio_templates`;
CREATE TABLE `tbl_invoice_studio_templates` (
  `Template_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Document_Type` VARCHAR(40) NOT NULL,
  `Template_Name` VARCHAR(100) NOT NULL,
  `Template_Code` VARCHAR(30),
  `Is_Default` TINYINT(1) DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Paper_Size` VARCHAR(20) DEFAULT 'A4',
  `Canvas_Width_MM` DECIMAL(8,2) DEFAULT '210',
  `Canvas_Height_MM` DECIMAL(8,2) DEFAULT '297',
  `Margin_Top` DECIMAL(6,2) DEFAULT '10',
  `Margin_Bottom` DECIMAL(6,2) DEFAULT '10',
  `Margin_Left` DECIMAL(6,2) DEFAULT '10',
  `Margin_Right` DECIMAL(6,2) DEFAULT '10',
  `Orientation` VARCHAR(10) DEFAULT 'Portrait',
  `Primary_Color` VARCHAR(7) DEFAULT '#B8860B',
  `Secondary_Color` VARCHAR(7) DEFAULT '#1A1A1A',
  `Background_Color` VARCHAR(7) DEFAULT '#FFFFFF',
  `Font_Family` VARCHAR(50) DEFAULT 'Arial',
  `Base_Font_Size` INT DEFAULT 10,
  `Components` JSON DEFAULT ('[]'),
  `GST_Config` JSON DEFAULT ('{}'),
  `Variables` JSON DEFAULT ('{}'),
  `Custom_CSS` TEXT,
  `Custom_JS` TEXT,
  `Logo_URL` TEXT,
  `Stamp_URL` TEXT,
  `Signature_URL` TEXT,
  `Version` INT DEFAULT 1,
  `Version_History` JSON DEFAULT ('[]'),
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Updated_By` VARCHAR(50),
  `Last_Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Template_ID`),
  UNIQUE KEY `tbl_invoice_studio_templates_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_studio_lookup` (`Document_Type`, `Is_Default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_invoice_template_master`;
CREATE TABLE `tbl_invoice_template_master` (
  `Template_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Document_Type` VARCHAR(30) NOT NULL,
  `Branch_ID` VARCHAR(20),
  `Template_Name` VARCHAR(100) NOT NULL,
  `Template_Version` INT DEFAULT 1,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Is_Default` TINYINT(1) DEFAULT 0,
  `Paper_Size` VARCHAR(20) DEFAULT 'A4',
  `Orientation` VARCHAR(10) DEFAULT 'Portrait',
  `Font_Family` VARCHAR(50) DEFAULT 'Arial',
  `Font_Size` INT DEFAULT 10,
  `Primary_Color` VARCHAR(7) DEFAULT '#B8860B',
  `Secondary_Color` VARCHAR(7) DEFAULT '#1A1A1A',
  `Background_Color` VARCHAR(7) DEFAULT '#FFFFFF',
  `Header_Logo_URL` TEXT,
  `Header_Text` JSON,
  `Header_Address` JSON,
  `Header_Contact` JSON,
  `Footer_Text` JSON,
  `Footer_Message` VARCHAR(500),
  `Field_Visibility` JSON,
  `Field_Order` JSON,
  `Field_Labels` JSON,
  `Is_Tax_Invoice` TINYINT(1) DEFAULT 1,
  `Show_Round_Off` TINYINT(1) DEFAULT 1,
  `Show_GST_Breakdown` TINYINT(1) DEFAULT 1,
  `Show_Old_Gold_Details` TINYINT(1) DEFAULT 0,
  `Show_Karigar_Details` TINYINT(1) DEFAULT 0,
  `Show_Wastage_Column` TINYINT(1) DEFAULT 0,
  `Show_Hallmark_Number` TINYINT(1) DEFAULT 1,
  `Show_QR_Code` TINYINT(1) DEFAULT 1,
  `Signature_Field_Label` VARCHAR(50) DEFAULT 'Customer Signature',
  `Signature_Field_Required` TINYINT(1) DEFAULT 1,
  `Copy_Type` VARCHAR(20) DEFAULT 'Original',
  `Custom_CSS` TEXT,
  `Custom_HTML_Header` TEXT,
  `Custom_HTML_Footer` TEXT,
  `Cache_PDF_HTML` TEXT,
  `Cache_Last_Generated` DATETIME,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Updated_By` VARCHAR(50),
  `Last_Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Template_ID`),
  UNIQUE KEY `tbl_invoice_template_master_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_template_lookup` (`Document_Type`, `Is_Active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_issue_to_karigar`;
CREATE TABLE `tbl_issue_to_karigar` (
  `Issue_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Karigar_ID` INT,
  `Issue_Number` VARCHAR(30) NOT NULL,
  `Issue_Date` DATE NOT NULL,
  `Expected_Return_Date` DATE,
  `Gold_Weight_Issued` DECIMAL(10,3) NOT NULL,
  `Purity_ID` INT,
  `Gold_Rate_At_Issue` DECIMAL(10,2) NOT NULL,
  `Total_Value_Issued` DECIMAL(15,2),
  `Design_ID` INT,
  `Wastage_Allowed_Percent` DECIMAL(5,2) DEFAULT '3',
  `Karigar_Wages_Rate` DECIMAL(10,2),
  `Estimated_Wages` DECIMAL(15,2),
  `Status` VARCHAR(20) DEFAULT 'Issued',
  `Return_Date` DATE,
  `Returned_Weight` DECIMAL(10,3) DEFAULT '0',
  `Wastage_Used` DECIMAL(10,3) DEFAULT '0',
  `Missing_Weight` DECIMAL(10,3) DEFAULT '0',
  `Missing_Value` DECIMAL(15,2) DEFAULT '0',
  `Final_Wages_Paid` DECIMAL(15,2) DEFAULT '0',
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Issue_ID`),
  UNIQUE KEY `tbl_issue_to_karigar_issue_number_unique` (`Issue_Number`),
  UNIQUE KEY `tbl_issue_to_karigar_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_issue_karigar` (`Karigar_ID`, `Status`),
  KEY `idx_issue_to_karigar_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_item_type_master`;
CREATE TABLE `tbl_item_type_master` (
  `Type_ID` INT NOT NULL AUTO_INCREMENT,
  `Type_Code` VARCHAR(20) NOT NULL,
  `Type_Name` VARCHAR(50) NOT NULL,
  `Category` VARCHAR(20) NOT NULL,
  `Is_Precious` TINYINT(1) DEFAULT 1,
  `Is_Gold` TINYINT(1) DEFAULT 1,
  `Is_Silver` TINYINT(1) DEFAULT 0,
  `Default_Making_Charge` DECIMAL(10,2),
  `Default_Wastage_Percent` DECIMAL(5,2),
  `HSN_Code` VARCHAR(20),
  `GST_Percentage` DECIMAL(5,2) DEFAULT '3',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Image_URL` VARCHAR(500),
  `Description` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Type_ID`),
  UNIQUE KEY `tbl_item_type_master_type_code_unique` (`Type_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_loyalty_points_slab`;
CREATE TABLE `tbl_loyalty_points_slab` (
  `Slab_ID` INT NOT NULL AUTO_INCREMENT,
  `Amount_From` DECIMAL(15,2) NOT NULL,
  `Amount_To` DECIMAL(15,2),
  `Metal_Type` VARCHAR(20),
  `Points_Per_Unit` DECIMAL(10,4) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Slab_ID`),
  UNIQUE KEY `tbl_loyalty_points_slab_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_loyalty_transactions`;
CREATE TABLE `tbl_loyalty_transactions` (
  `Loyalty_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Customer_ID` INT,
  `Txn_Type` VARCHAR(20) NOT NULL,
  `Points` DECIMAL(10,2) NOT NULL,
  `Running_Balance` DECIMAL(10,2) NOT NULL,
  `Sale_ID` BIGINT,
  `Description` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Loyalty_ID`),
  UNIQUE KEY `tbl_loyalty_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_loyalty_customer` (`Customer_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_making_charge_master`;
CREATE TABLE `tbl_making_charge_master` (
  `MC_ID` INT NOT NULL AUTO_INCREMENT,
  `MC_Name` VARCHAR(100) NOT NULL,
  `Charge_Type` VARCHAR(20) DEFAULT 'Per Gram',
  `Charge_Value` DECIMAL(10,2) NOT NULL,
  `Type_ID` INT,
  `Purity_Code` VARCHAR(10),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`MC_ID`),
  UNIQUE KEY `tbl_making_charge_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_melting_refining_log`;
CREATE TABLE `tbl_melting_refining_log` (
  `Log_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Process_Type` VARCHAR(20) NOT NULL,
  `Metal_Type` VARCHAR(20) NOT NULL,
  `Purity_In_Code` VARCHAR(10),
  `Purity_Out_Code` VARCHAR(10),
  `Weight_In` DECIMAL(10,3) NOT NULL,
  `Weight_Out` DECIMAL(10,3),
  `Loss_Weight` DECIMAL(10,3) DEFAULT '0',
  `Loss_Pct` DECIMAL(5,2),
  `Refiner_Vendor_ID` INT,
  `Log_Date` DATE NOT NULL,
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Log_ID`),
  UNIQUE KEY `tbl_melting_refining_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_melting_refining_type` (`Process_Type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_mobile_otp`;
CREATE TABLE `tbl_mobile_otp` (
  `OTP_ID` INT NOT NULL AUTO_INCREMENT,
  `Mobile` VARCHAR(20) NOT NULL,
  `OTP` VARCHAR(6) NOT NULL,
  `Purpose` VARCHAR(30) DEFAULT 'LOGIN',
  `Is_Used` TINYINT(1) DEFAULT 0,
  `Expires_At` DATETIME NOT NULL,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`OTP_ID`),
  KEY `idx_otp_mobile` (`Mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_mould_bom_stock`;
CREATE TABLE `tbl_mould_bom_stock` (
  `Mould_ID` INT NOT NULL AUTO_INCREMENT,
  `Design_ID` INT,
  `Mould_Name` VARCHAR(100) NOT NULL,
  `Rubber_Type` VARCHAR(50),
  `Stock_Qty` INT DEFAULT 0,
  `Standard_Wax_Weight` DECIMAL(10,3),
  `Standard_Wastage_Pct` DECIMAL(5,2) DEFAULT '0',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Mould_ID`),
  UNIQUE KEY `tbl_mould_bom_stock_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_non_tag_issue_header`;
CREATE TABLE `tbl_non_tag_issue_header` (
  `NTA_Issue_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Voucher_Number` VARCHAR(40) NOT NULL,
  `Party_ID` BIGINT,
  `Issue_Date` DATE NOT NULL,
  `Expected_Return_Date` DATE,
  `Total_Items_Issued` INT NOT NULL DEFAULT 0,
  `Total_Weight_Issued` DECIMAL(10,3) DEFAULT '0',
  `Total_Value_Issued` DECIMAL(15,2) DEFAULT '0',
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_By` VARCHAR(50),
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Cancelled_By` VARCHAR(50),
  `Cancelled_Date` DATETIME,
  `Cancellation_Reason` TEXT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`NTA_Issue_ID`),
  UNIQUE KEY `tbl_non_tag_issue_header_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_non_tag_issue_header_voucher_number_unique` (`Voucher_Number`),
  KEY `idx_nta_issue_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_non_tag_issue_items`;
CREATE TABLE `tbl_non_tag_issue_items` (
  `NTA_Issue_Item_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `NTA_Issue_ID` BIGINT NOT NULL,
  `Type_ID` INT,
  `Item_Type` VARCHAR(100),
  `Design_ID` INT,
  `Design_Type` VARCHAR(100),
  `Category` VARCHAR(100),
  `Gross_Weight` DECIMAL(10,3),
  `Purity_ID` INT,
  `Metal_Type` VARCHAR(50),
  `Approx_Value` DECIMAL(15,2),
  `Image_URL` VARCHAR(500),
  `Remarks` TEXT,
  `Item_Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Received_In_Receive_ID` BIGINT,
  `Received_Date` DATETIME,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`NTA_Issue_Item_ID`),
  UNIQUE KEY `tbl_non_tag_issue_items_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_nta_issue_items_status` (`NTA_Issue_ID`, `Item_Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_non_tag_receive_header`;
CREATE TABLE `tbl_non_tag_receive_header` (
  `NTA_Receive_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Voucher_Number` VARCHAR(40) NOT NULL,
  `NTA_Issue_ID` BIGINT NOT NULL,
  `Receive_Date` DATE NOT NULL,
  `Items_Received_Count` INT NOT NULL DEFAULT 0,
  `Total_Weight_Received` DECIMAL(10,3) DEFAULT '0',
  `Total_Value_Received` DECIMAL(15,2) DEFAULT '0',
  `Remarks` TEXT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`NTA_Receive_ID`),
  UNIQUE KEY `tbl_non_tag_receive_header_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_non_tag_receive_header_voucher_number_unique` (`Voucher_Number`),
  KEY `idx_nta_receive_issue` (`NTA_Issue_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_old_gold_exchange`;
CREATE TABLE `tbl_old_gold_exchange` (
  `Exchange_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sale_ID` BIGINT,
  `Customer_ID` INT,
  `Exchange_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Old_Gold_Weight` DECIMAL(10,3) NOT NULL,
  `Old_Gold_Purity_Code` VARCHAR(10),
  `Purity_Percentage` DECIMAL(5,2),
  `Melting_Deduction_Percent` DECIMAL(5,2) DEFAULT '2',
  `Melting_Deduction_Weight` DECIMAL(10,3),
  `Net_Exchange_Weight` DECIMAL(10,3),
  `Gold_Rate_At_Exchange` DECIMAL(10,2),
  `Total_Value` DECIMAL(15,2) NOT NULL,
  `Used_Amount` DECIMAL(15,2) DEFAULT '0',
  `Balance_Amount` DECIMAL(15,2) DEFAULT '0',
  `Certificate_No` VARCHAR(50),
  `Tested_By` VARCHAR(50),
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Voucher_Number` VARCHAR(30),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Exchange_ID`),
  UNIQUE KEY `tbl_old_gold_exchange_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_old_gold_exchange_voucher_number_unique` (`Voucher_Number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_ornament_master`;
CREATE TABLE `tbl_ornament_master` (
  `Ornament_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Article_Number` VARCHAR(50) NOT NULL,
  `Type_ID` INT,
  `Design_ID` INT,
  `Purity_ID` INT,
  `Gross_Weight` DECIMAL(10,3) NOT NULL,
  `Net_Gold_Weight` DECIMAL(10,3) NOT NULL,
  `Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Wastage_Weight` DECIMAL(10,3) DEFAULT '0',
  `Melting_Weight` DECIMAL(10,3) DEFAULT '0',
  `Stone_ID` INT,
  `Number_Of_Stones` INT DEFAULT 0,
  `Total_Stone_Carat` DECIMAL(10,3) DEFAULT '0',
  `Current_Gold_Rate` DECIMAL(10,2) NOT NULL,
  `Base_Making_Charge_Per_Gram` DECIMAL(10,2) NOT NULL,
  `Final_Making_Charge_Total` DECIMAL(10,2),
  `Wastage_Percentage` DECIMAL(5,2) DEFAULT '3',
  `Wastage_Amount` DECIMAL(10,2),
  `Discount_Percentage` DECIMAL(5,2) DEFAULT '0',
  `Discount_Amount` DECIMAL(10,2) DEFAULT '0',
  `Taxable_Value` DECIMAL(15,2),
  `GST_Amount` DECIMAL(15,2),
  `Total_Price` DECIMAL(15,2),
  `Supplier_ID` INT,
  `Karigar_ID` INT,
  `Purchase_Cost` DECIMAL(15,2) NOT NULL,
  `Stock_Quantity` INT DEFAULT 1,
  `Min_Stock_Level` INT DEFAULT 5,
  `Physical_Location` VARCHAR(50),
  `Hallmark_Certificate_No` VARCHAR(50),
  `Hallmark_Date` DATE,
  `Is_Sold` TINYINT(1) DEFAULT 0,
  `Is_Returned` TINYINT(1) DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Is_Stock_Available` TINYINT(1) DEFAULT 1,
  `Is_On_Display` TINYINT(1) DEFAULT 0,
  `Is_On_Approval` TINYINT(1) DEFAULT 0,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Updated_By` VARCHAR(50),
  `Last_Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Physical_Verify_Date` DATE,
  `Special_Instructions` TEXT,
  `Certification_Image_URL` VARCHAR(500),
  `Product_Image_URL` VARCHAR(500),
  `QR_Code_Data` TEXT,
  `HUID_Number` VARCHAR(50),
  `Collection_ID` INT,
  `Brand_ID` INT,
  `SubCat_ID` INT,
  `RFID_Tag` VARCHAR(100),
  `MC_ID` INT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Bin_Source` VARCHAR(50),
  `Bin_Voucher_ID` VARCHAR(50),
  `Floor_ID` INT,
  `Counter_ID` INT,
  `Tray_ID` INT,
  `Is_Hidden` TINYINT(1) NOT NULL DEFAULT 0,
  `Hidden_Location_ID` INT,
  `Hidden_By` VARCHAR(50),
  `Hidden_Date` DATETIME,
  `Hidden_Reason` TEXT,
  `Restored_By` VARCHAR(50),
  `Restored_Date` DATETIME,
  `Approval_Issue_ID` BIGINT,
  `Approval_Out_By` VARCHAR(50),
  `Approval_Out_Date` DATETIME,
  `Approval_Receive_ID` BIGINT,
  `Approval_Received_By` VARCHAR(50),
  `Approval_Received_Date` DATETIME,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Ornament_ID`),
  UNIQUE KEY `tbl_ornament_master_article_number_unique` (`Article_Number`),
  UNIQUE KEY `tbl_ornament_master_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_ornament_active` (`Is_Active`, `Is_Sold`),
  KEY `idx_ornament_is_hidden` (`Is_Hidden`),
  KEY `idx_ornament_master_data_mode` (`Data_Mode`),
  KEY `idx_ornament_on_approval` (`Is_On_Approval`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pawn_loan_guarantor`;
CREATE TABLE `tbl_pawn_loan_guarantor` (
  `Guarantor_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Loan_ID` BIGINT NOT NULL,
  `Guarantor_Name` VARCHAR(100) NOT NULL,
  `Mobile` VARCHAR(15) NOT NULL,
  `Address` TEXT,
  `Relation_To_Borrower` VARCHAR(50),
  `ID_Proof_Type` VARCHAR(30),
  `ID_Proof_Number` VARCHAR(50),
  `ID_Proof_URL` VARCHAR(500),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Guarantor_ID`),
  KEY `idx_pawn_guarantor_loan` (`Loan_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pawn_loan_header`;
CREATE TABLE `tbl_pawn_loan_header` (
  `Loan_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Loan_Number` VARCHAR(30) NOT NULL,
  `Customer_ID` INT,
  `Loan_Date` DATE NOT NULL,
  `Total_Gross_Weight` DECIMAL(10,3) DEFAULT '0',
  `Total_Net_Weight` DECIMAL(10,3) DEFAULT '0',
  `Appraised_Value` DECIMAL(15,2) NOT NULL,
  `Loan_Amount` DECIMAL(15,2) NOT NULL,
  `Interest_Rate_Pct` DECIMAL(5,2) NOT NULL,
  `Interest_Type` VARCHAR(20) DEFAULT 'Monthly',
  `Tenure_Months` INT DEFAULT 12,
  `Due_Date` DATE,
  `Interest_Paid_Upto_Amount` DECIMAL(15,2) DEFAULT '0',
  `Interest_Paid_Upto_Date` DATE,
  `Principal_Outstanding` DECIMAL(15,2),
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Active',
  `Redeemed_Date` DATE,
  `Auctioned_Date` DATE,
  `Auction_Sale_Value` DECIMAL(15,2),
  `Photo_URL` VARCHAR(500),
  `ID_Proof_URL` VARCHAR(1000),
  `Remarks` TEXT,
  `Voucher_ID` VARCHAR(50),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_By` VARCHAR(50),
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Loan_ID`),
  UNIQUE KEY `tbl_pawn_loan_header_loan_number_unique` (`Loan_Number`),
  UNIQUE KEY `tbl_pawn_loan_header_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_pawn_loan_customer` (`Customer_ID`),
  KEY `idx_pawn_loan_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pawn_loan_items`;
CREATE TABLE `tbl_pawn_loan_items` (
  `Item_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Loan_ID` BIGINT NOT NULL,
  `Item_Description` VARCHAR(200) NOT NULL,
  `Type_ID` INT,
  `Gross_Weight` DECIMAL(10,3) NOT NULL,
  `Net_Weight` DECIMAL(10,3) NOT NULL,
  `Purity_Code` VARCHAR(10),
  `Estimated_Value` DECIMAL(15,2),
  `Item_Photo_URL` VARCHAR(500),
  `Item_Status` VARCHAR(20) NOT NULL DEFAULT 'Pledged',
  `Returned_Date` DATE,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Item_ID`),
  UNIQUE KEY `tbl_pawn_loan_items_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_pawn_items_loan` (`Loan_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pawn_loan_transactions`;
CREATE TABLE `tbl_pawn_loan_transactions` (
  `Txn_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Loan_ID` BIGINT NOT NULL,
  `Txn_Type` VARCHAR(20) NOT NULL,
  `Txn_Date` DATE NOT NULL,
  `Interest_Collected` DECIMAL(15,2) DEFAULT '0',
  `Principal_Collected` DECIMAL(15,2) DEFAULT '0',
  `Total_Amount` DECIMAL(15,2) NOT NULL,
  `Balance_Due` DECIMAL(15,2),
  `Payment_Mode` VARCHAR(20),
  `Receipt_Number` VARCHAR(30),
  `Remarks` TEXT,
  `Voucher_ID` VARCHAR(50),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_pawn_loan_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_pawn_txn_loan` (`Loan_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_payment_gateway_config`;
CREATE TABLE `tbl_payment_gateway_config` (
  `Config_ID` INT NOT NULL AUTO_INCREMENT,
  `Gateway` VARCHAR(30) NOT NULL,
  `Key_ID` VARCHAR(200),
  `Key_Secret` VARCHAR(500),
  `Merchant_ID` VARCHAR(200),
  `Salt_Key` VARCHAR(500),
  `Salt_Index` VARCHAR(10),
  `Environment` VARCHAR(20) DEFAULT 'production',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Config_ID`),
  UNIQUE KEY `tbl_payment_gateway_config_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_payment_gateway_config_tenant_id_gateway_unique` (`Gateway`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_payroll_details`;
CREATE TABLE `tbl_payroll_details` (
  `Detail_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Run_ID` INT NOT NULL,
  `User_ID` INT,
  `Days_Present` INT DEFAULT 0,
  `Days_Absent` INT DEFAULT 0,
  `Gross_Salary` DECIMAL(12,2) NOT NULL DEFAULT '0',
  `PF_Deduction` DECIMAL(10,2) DEFAULT '0',
  `ESI_Deduction` DECIMAL(10,2) DEFAULT '0',
  `Other_Deductions` DECIMAL(10,2) DEFAULT '0',
  `Incentive_Amount` DECIMAL(10,2) DEFAULT '0',
  `Net_Salary` DECIMAL(12,2) NOT NULL DEFAULT '0',
  `Payment_Status` VARCHAR(20) DEFAULT 'Pending',
  `Payment_Date` DATE,
  `Payment_Mode` VARCHAR(20),
  PRIMARY KEY (`Detail_ID`),
  KEY `idx_payroll_details_run` (`Run_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_payroll_run`;
CREATE TABLE `tbl_payroll_run` (
  `Run_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Pay_Month` INT NOT NULL,
  `Pay_Year` INT NOT NULL,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
  `Generated_By` VARCHAR(50),
  `Generated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Finalized_Date` DATETIME,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Run_ID`),
  UNIQUE KEY `tbl_payroll_run_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_payroll_run_tenant_id_branch_id_pay_month_pay_year_unique` (`Branch_ID`, `Pay_Month`, `Pay_Year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pg_order_track`;
CREATE TABLE `tbl_pg_order_track` (
  `Track_ID` INT NOT NULL AUTO_INCREMENT,
  `Gateway` VARCHAR(30) NOT NULL,
  `Order_ID` VARCHAR(100),
  `Amount` DECIMAL(15,2),
  `Currency` VARCHAR(10) DEFAULT 'INR',
  `Receipt` VARCHAR(100),
  `Member_ID` INT,
  `Purpose` VARCHAR(100),
  `Status` VARCHAR(30) DEFAULT 'created',
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Track_ID`),
  UNIQUE KEY `tbl_pg_order_track_order_id_unique` (`Order_ID`),
  UNIQUE KEY `tbl_pg_order_track_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_pg_transactions`;
CREATE TABLE `tbl_pg_transactions` (
  `Txn_ID` INT NOT NULL AUTO_INCREMENT,
  `Gateway` VARCHAR(30) NOT NULL,
  `Order_ID` VARCHAR(100),
  `Payment_ID` VARCHAR(100),
  `Signature` VARCHAR(300),
  `Amount` DECIMAL(15,2) NOT NULL,
  `Currency` VARCHAR(10) DEFAULT 'INR',
  `Status` VARCHAR(30) DEFAULT 'pending',
  `Member_ID` INT,
  `Scheme_ID` INT,
  `Purpose` VARCHAR(100),
  `Raw_Response` TEXT,
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_pg_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_pg_txn_member` (`Member_ID`),
  KEY `idx_pg_txn_tenant` (`Gateway`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_printer_config`;
CREATE TABLE `tbl_printer_config` (
  `Config_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Printer_Role` VARCHAR(20) NOT NULL,
  `Printer_Name` VARCHAR(150) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Config_ID`),
  UNIQUE KEY `tbl_printer_config_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_printer_config_lookup` (`Branch_ID`, `Printer_Role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_product_images`;
CREATE TABLE `tbl_product_images` (
  `Image_ID` INT NOT NULL AUTO_INCREMENT,
  `Article_Number` VARCHAR(50) NOT NULL,
  `Image_URL` TEXT NOT NULL,
  `Thumbnail_URL` TEXT,
  `Sort_Order` INT DEFAULT 0,
  `Is_Primary` TINYINT(1) DEFAULT 0,
  `Uploaded_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Ornament_ID` BIGINT,
  `Image_Type` VARCHAR(30) DEFAULT 'front',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Image_ID`),
  UNIQUE KEY `tbl_product_images_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_prod_img` (`Article_Number`),
  KEY `idx_prod_img_article` (`Article_Number`),
  KEY `idx_prod_img_ornament` (`Ornament_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_production_department_master`;
CREATE TABLE `tbl_production_department_master` (
  `Dept_ID` INT NOT NULL AUTO_INCREMENT,
  `Dept_Code` VARCHAR(20) NOT NULL,
  `Dept_Name` VARCHAR(100) NOT NULL,
  `Sequence_No` INT DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Dept_ID`),
  UNIQUE KEY `tbl_production_department_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_production_department_master_tenant_id_dept_code_unique` (`Dept_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_production_transaction`;
CREATE TABLE `tbl_production_transaction` (
  `Txn_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `BOM_ID` INT,
  `Dept_ID` INT,
  `Karigar_ID` INT,
  `Ornament_ID` BIGINT,
  `Txn_Date` DATE NOT NULL,
  `Input_Weight` DECIMAL(10,3) NOT NULL,
  `Output_Weight` DECIMAL(10,3),
  `Wastage_Weight` DECIMAL(10,3) DEFAULT '0',
  `Wastage_Pct` DECIMAL(5,2),
  `Labour_Amount` DECIMAL(10,2) DEFAULT '0',
  `Status` VARCHAR(20) DEFAULT 'In Progress',
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_production_transaction_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_prod_txn_dept` (`Dept_ID`),
  KEY `idx_prod_txn_ornament` (`Ornament_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_purchase_details`;
CREATE TABLE `tbl_purchase_details` (
  `Detail_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Purchase_ID` BIGINT NOT NULL,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50),
  `Type_ID` INT,
  `Item_Description` VARCHAR(200),
  `Quantity` INT DEFAULT 1,
  `Gross_Weight` DECIMAL(10,3),
  `Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Net_Weight` DECIMAL(10,3),
  `Purity_Code` VARCHAR(10),
  `Gold_Rate` DECIMAL(10,2),
  `Making_Charge` DECIMAL(10,2),
  `Stone_Value` DECIMAL(10,2) DEFAULT '0',
  `Purchase_Rate` DECIMAL(15,2) NOT NULL,
  `Total_Line_Value` DECIMAL(15,2) NOT NULL,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Net_Weight_Display` DECIMAL(10,3),
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Detail_ID`),
  UNIQUE KEY `tbl_purchase_details_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_purchase_header`;
CREATE TABLE `tbl_purchase_header` (
  `Purchase_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Purchase_Number` VARCHAR(30) NOT NULL,
  `Purchase_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Supplier_ID` INT,
  `Supplier_Name` VARCHAR(100),
  `Supplier_Invoice_No` VARCHAR(50),
  `Supplier_Invoice_Date` DATE,
  `Purchase_Type` VARCHAR(20) DEFAULT 'Stock',
  `Total_Gross_Weight` DECIMAL(10,3) DEFAULT '0',
  `Total_Net_Weight` DECIMAL(10,3) DEFAULT '0',
  `Subtotal_Amount` DECIMAL(15,2) DEFAULT '0',
  `GST_Amount` DECIMAL(15,2) DEFAULT '0',
  `Total_Amount` DECIMAL(15,2) NOT NULL,
  `Amount_Paid` DECIMAL(15,2) DEFAULT '0',
  `Balance_Amount` DECIMAL(15,2) DEFAULT '0',
  `Payment_Status` VARCHAR(20) DEFAULT 'Pending',
  `Payment_Mode` VARCHAR(20),
  `Status` VARCHAR(20) DEFAULT 'Draft',
  `Approved_By` VARCHAR(50),
  `Approved_Date` DATETIME,
  `Notes` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Bin_Source` VARCHAR(20),
  `Bin_Voucher_ID` VARCHAR(50),
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Purchase_ID`),
  UNIQUE KEY `tbl_purchase_header_purchase_number_unique` (`Purchase_Number`),
  UNIQUE KEY `tbl_purchase_header_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_purchase_date` (`Purchase_Date`),
  KEY `idx_purchase_header_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_purity_master`;
CREATE TABLE `tbl_purity_master` (
  `Purity_ID` INT NOT NULL AUTO_INCREMENT,
  `Purity_Code` VARCHAR(10) NOT NULL,
  `Karat` DECIMAL(5,2) NOT NULL,
  `Percentage` DECIMAL(5,2) NOT NULL,
  `Description` VARCHAR(50),
  `Hallmark_Standard` VARCHAR(20),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Purity_ID`),
  UNIQUE KEY `tbl_purity_master_purity_code_unique` (`Purity_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_rate_booking`;
CREATE TABLE `tbl_rate_booking` (
  `Booking_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Booking_Number` VARCHAR(30) NOT NULL,
  `Customer_ID` INT,
  `Booking_Date` DATE NOT NULL,
  `Metal_Type` VARCHAR(20) NOT NULL,
  `Purity_Code` VARCHAR(10),
  `Booked_Rate` DECIMAL(10,2) NOT NULL,
  `Weight_Booked` DECIMAL(10,3) NOT NULL,
  `Advance_Amount` DECIMAL(15,2) DEFAULT '0',
  `Valid_Until` DATE NOT NULL,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Open',
  `Utilized_Sale_ID` BIGINT,
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Booking_ID`),
  UNIQUE KEY `tbl_rate_booking_booking_number_unique` (`Booking_Number`),
  UNIQUE KEY `tbl_rate_booking_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_rate_booking_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_reorder_request`;
CREATE TABLE `tbl_reorder_request` (
  `Request_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Type_ID` INT,
  `Design_ID` INT,
  `Requested_Qty` INT NOT NULL DEFAULT 1,
  `Reason` VARCHAR(200),
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Fulfilled_Purchase_ID` BIGINT,
  `Requested_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Request_ID`),
  UNIQUE KEY `tbl_reorder_request_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_reorder_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_repair_orders`;
CREATE TABLE `tbl_repair_orders` (
  `Repair_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Job_Card_Number` VARCHAR(30) NOT NULL,
  `Received_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Customer_ID` INT,
  `Customer_Name` VARCHAR(100),
  `Customer_Mobile` VARCHAR(15),
  `Item_Description` VARCHAR(200) NOT NULL,
  `Item_Type` VARCHAR(50),
  `Item_Weight` DECIMAL(10,3),
  `Purity` VARCHAR(10),
  `Repair_Work_Required` TEXT,
  `Technician_Notes` TEXT,
  `Assigned_Karigar_ID` INT,
  `Status` VARCHAR(20) DEFAULT 'Received',
  `Expected_Delivery` DATE,
  `Actual_Delivery` DATE,
  `Estimate_Amount` DECIMAL(10,2),
  `Labour_Charge` DECIMAL(10,2) DEFAULT '0',
  `Material_Charge` DECIMAL(10,2) DEFAULT '0',
  `Total_Charge` DECIMAL(10,2) DEFAULT '0',
  `Advance_Paid` DECIMAL(10,2) DEFAULT '0',
  `Balance_Due` DECIMAL(10,2) DEFAULT '0',
  `Before_Image_URL` VARCHAR(500),
  `After_Image_URL` VARCHAR(500),
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Repair_ID`),
  UNIQUE KEY `tbl_repair_orders_job_card_number_unique` (`Job_Card_Number`),
  UNIQUE KEY `tbl_repair_orders_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_repair_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_return_from_karigar`;
CREATE TABLE `tbl_return_from_karigar` (
  `Return_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Issue_ID` BIGINT,
  `Return_Number` VARCHAR(30) NOT NULL,
  `Return_Date` DATE NOT NULL,
  `Ornament_ID` BIGINT,
  `Gross_Weight_Returned` DECIMAL(10,3) NOT NULL,
  `Net_Gold_Weight` DECIMAL(10,3) NOT NULL,
  `Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Wastage_Weight` DECIMAL(10,3) DEFAULT '0',
  `Wastage_Percentage_Applied` DECIMAL(5,2),
  `Gold_Rate_At_Return` DECIMAL(10,2),
  `Total_Value_Returned` DECIMAL(15,2),
  `Quality_Check_Passed` TINYINT(1) DEFAULT 1,
  `Quality_Remarks` TEXT,
  `Rejection_Reason` VARCHAR(200),
  `Status` VARCHAR(20) DEFAULT 'Received',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Return_ID`),
  UNIQUE KEY `tbl_return_from_karigar_return_number_unique` (`Return_Number`),
  UNIQUE KEY `tbl_return_from_karigar_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_rfid_scan_log`;
CREATE TABLE `tbl_rfid_scan_log` (
  `Scan_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Ornament_ID` BIGINT,
  `RFID_Tag` VARCHAR(100) NOT NULL,
  `Scan_Type` VARCHAR(20) NOT NULL,
  `Scan_Location` VARCHAR(100),
  `Scanned_By` VARCHAR(50),
  `Scan_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Scan_ID`),
  UNIQUE KEY `tbl_rfid_scan_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_rfid_scan_ornament` (`Ornament_ID`),
  KEY `idx_rfid_scan_tag` (`RFID_Tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_role_master`;
CREATE TABLE `tbl_role_master` (
  `Role_ID` INT NOT NULL AUTO_INCREMENT,
  `Role_Name` VARCHAR(50) NOT NULL,
  `Role_Description` TEXT,
  `Permissions` JSON,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Description` TEXT,
  `Created_By` VARCHAR(100),
  `Modified_Date` DATETIME,
  PRIMARY KEY (`Role_ID`),
  UNIQUE KEY `tbl_role_master_role_name_unique` (`Role_Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_salary_structure`;
CREATE TABLE `tbl_salary_structure` (
  `Structure_ID` INT NOT NULL AUTO_INCREMENT,
  `User_ID` INT NOT NULL,
  `Basic` DECIMAL(10,2) NOT NULL DEFAULT '0',
  `HRA` DECIMAL(10,2) DEFAULT '0',
  `Conveyance` DECIMAL(10,2) DEFAULT '0',
  `Other_Allowance` DECIMAL(10,2) DEFAULT '0',
  `PF_Pct` DECIMAL(5,2) DEFAULT '0',
  `ESI_Pct` DECIMAL(5,2) DEFAULT '0',
  `Effective_From` DATE NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Structure_ID`),
  KEY `idx_salary_structure_user` (`User_ID`, `Is_Active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sales_details`;
CREATE TABLE `tbl_sales_details` (
  `Detail_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sale_ID` BIGINT NOT NULL,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50),
  `Item_Type_Name` VARCHAR(50),
  `Quantity` INT DEFAULT 1,
  `Gross_Weight` DECIMAL(10,3),
  `Net_Gold_Weight` DECIMAL(10,3),
  `Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Purity_Code` VARCHAR(10),
  `Gold_Rate_Per_Gram` DECIMAL(10,2),
  `Making_Charge_Applied` DECIMAL(10,2),
  `Wastage_Amount_Applied` DECIMAL(10,2),
  `Discount_Percentage_Applied` DECIMAL(5,2) DEFAULT '0',
  `Discount_Amount_Applied` DECIMAL(10,2) DEFAULT '0',
  `Taxable_Value` DECIMAL(15,2),
  `GST_Percentage_Applied` DECIMAL(5,2) DEFAULT '3',
  `GST_Amount` DECIMAL(15,2) DEFAULT '0',
  `Total_Line_Price` DECIMAL(15,2) NOT NULL,
  `Serial_No` INT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Net_Weight_Display` DECIMAL(10,3),
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Detail_ID`),
  UNIQUE KEY `tbl_sales_details_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sales_header`;
CREATE TABLE `tbl_sales_header` (
  `Sale_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Invoice_Number` VARCHAR(30) NOT NULL,
  `Sale_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Customer_ID` INT,
  `Customer_Name` VARCHAR(100),
  `Customer_Mobile` VARCHAR(15),
  `Total_Gross_Weight` DECIMAL(10,3),
  `Total_Net_Gold_Weight` DECIMAL(10,3),
  `Total_Stone_Weight` DECIMAL(10,3) DEFAULT '0',
  `Subtotal_Amount` DECIMAL(15,2) NOT NULL,
  `Discount_Amount` DECIMAL(15,2) DEFAULT '0',
  `GST_Amount` DECIMAL(15,2) DEFAULT '0',
  `GST_Percentage` DECIMAL(5,2) DEFAULT '3',
  `Round_Off_Amount` DECIMAL(10,2) DEFAULT '0',
  `Net_Payable_Amount` DECIMAL(15,2) NOT NULL,
  `Payment_Mode` VARCHAR(20),
  `Payment_Reference` VARCHAR(50),
  `Payment_Status` VARCHAR(20) DEFAULT 'Pending',
  `Amount_Paid` DECIMAL(15,2) DEFAULT '0',
  `Balance_Amount` DECIMAL(15,2) DEFAULT '0',
  `Old_Gold_Exchange_Amount` DECIMAL(15,2) DEFAULT '0',
  `Old_Gold_Weight` DECIMAL(10,3) DEFAULT '0',
  `Is_Exchange` TINYINT(1) DEFAULT 0,
  `Sale_Type` VARCHAR(20) DEFAULT 'Retail',
  `Invoice_Type` VARCHAR(20) DEFAULT 'Tax Invoice',
  `GST_Invoice_No` VARCHAR(50),
  `Delivery_Date` DATE,
  `Delivery_Status` VARCHAR(20) DEFAULT 'Pending',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Notes` TEXT,
  `Counter_ID` INT,
  `Counter_Name` VARCHAR(50),
  `Operator_Name` VARCHAR(100),
  `PAN_Number` VARCHAR(20),
  `PAN_Verified` TINYINT(1) DEFAULT 0,
  `Loyalty_Points_Used` DECIMAL(10,2) DEFAULT '0',
  `Loyalty_Points_Earned` DECIMAL(10,2) DEFAULT '0',
  `Voucher_Amount` DECIMAL(10,2) DEFAULT '0',
  `Scheme_Adjustment_Amount` DECIMAL(10,2) DEFAULT '0',
  `HUID_Numbers` VARCHAR(500),
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Voucher_ID` VARCHAR(50),
  `Bonus_Adjustment_Amount` DECIMAL(15,2) NOT NULL DEFAULT '0',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Sale_ID`),
  UNIQUE KEY `tbl_sales_header_invoice_number_unique` (`Invoice_Number`),
  UNIQUE KEY `tbl_sales_header_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_sales_counter` (`Counter_ID`),
  KEY `idx_sales_customer` (`Customer_ID`),
  KEY `idx_sales_date` (`Sale_Date`),
  KEY `idx_sales_header_data_mode` (`Data_Mode`),
  KEY `idx_sales_voucher_id` (`Voucher_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sales_incentive_transactions`;
CREATE TABLE `tbl_sales_incentive_transactions` (
  `Txn_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sale_ID` BIGINT NOT NULL,
  `User_ID` INT,
  `Slab_ID` INT,
  `Sale_Base_Amount` DECIMAL(15,2) NOT NULL,
  `Incentive_Pct_Applied` DECIMAL(5,2) NOT NULL,
  `Incentive_Amount` DECIMAL(10,2) NOT NULL,
  `Payout_Status` VARCHAR(20) DEFAULT 'Pending',
  `Payroll_Run_ID` INT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_sales_incentive_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_sales_incentive_sale` (`Sale_ID`),
  KEY `idx_sales_incentive_user` (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sales_payments`;
CREATE TABLE `tbl_sales_payments` (
  `Payment_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sale_ID` BIGINT NOT NULL,
  `Payment_Mode` VARCHAR(30) NOT NULL,
  `Amount` DECIMAL(15,2) NOT NULL,
  `Reference` VARCHAR(100),
  `Bank_Name` VARCHAR(100),
  `Cheque_Number` VARCHAR(50),
  `Voucher_ID` INT,
  `Scheme_Enrollment_ID` BIGINT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Payment_ID`),
  UNIQUE KEY `tbl_sales_payments_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_sale_payments` (`Sale_ID`),
  KEY `idx_sales_payments_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_saving_scheme_enrollment`;
CREATE TABLE `tbl_saving_scheme_enrollment` (
  `Enrollment_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Scheme_ID` INT,
  `Customer_ID` INT,
  `Enrollment_Number` VARCHAR(30) NOT NULL,
  `Start_Date` DATE NOT NULL,
  `Maturity_Date` DATE,
  `Monthly_Amount` DECIMAL(10,2) NOT NULL,
  `Installments_Paid` INT DEFAULT 0,
  `Total_Installments` INT NOT NULL,
  `Total_Amount_Paid` DECIMAL(15,2) DEFAULT '0',
  `Bonus_Amount` DECIMAL(10,2) DEFAULT '0',
  `Maturity_Value` DECIMAL(15,2) DEFAULT '0',
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Redemption_Date` DATE,
  `Redemption_Sale_ID` BIGINT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Enrollment_ID`),
  UNIQUE KEY `tbl_saving_scheme_enrollment_enrollment_number_unique` (`Enrollment_Number`),
  UNIQUE KEY `tbl_saving_scheme_enrollment_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_saving_scheme_master`;
CREATE TABLE `tbl_saving_scheme_master` (
  `Scheme_ID` INT NOT NULL AUTO_INCREMENT,
  `Scheme_Code` VARCHAR(20) NOT NULL,
  `Scheme_Name` VARCHAR(100) NOT NULL,
  `Metal_Type` VARCHAR(20) DEFAULT 'Gold',
  `Duration_Months` INT NOT NULL,
  `Free_Months` INT DEFAULT 1,
  `Monthly_Amount` DECIMAL(10,2) NOT NULL,
  `Bonus_Percent` DECIMAL(5,2) DEFAULT '0',
  `Terms` TEXT,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Scheme_ID`),
  UNIQUE KEY `tbl_saving_scheme_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_saving_scheme_master_tenant_id_scheme_code_unique` (`Scheme_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_accounting_entries`;
CREATE TABLE `tbl_scheme_accounting_entries` (
  `Entry_ID` INT NOT NULL AUTO_INCREMENT,
  `Txn_ID` INT,
  `Entry_Date` DATE NOT NULL,
  `Receipt_No` VARCHAR(60),
  `Member_ID` INT,
  `Debit_Account` VARCHAR(100) NOT NULL,
  `Credit_Account` VARCHAR(100) NOT NULL,
  `Amount` DECIMAL(15,2) NOT NULL,
  `Narration` TEXT,
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Entry_ID`),
  UNIQUE KEY `tbl_scheme_accounting_entries_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_bonuses`;
CREATE TABLE `tbl_scheme_bonuses` (
  `Bonus_ID` INT NOT NULL AUTO_INCREMENT,
  `Member_ID` BIGINT,
  `Bonus_Type` VARCHAR(30) NOT NULL,
  `Bonus_Amount` DECIMAL(10,2) DEFAULT '0',
  `Bonus_Gold_Grams` DECIMAL(10,3) DEFAULT '0',
  `Bonus_Product_Code` VARCHAR(50),
  `Voucher_Code` VARCHAR(50),
  `Credit_Date` DATE NOT NULL,
  `Is_Redeemed` TINYINT(1) DEFAULT 0,
  `Redemption_Date` DATE,
  `Notes` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Bonus_ID`),
  UNIQUE KEY `tbl_scheme_bonuses_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_draws`;
CREATE TABLE `tbl_scheme_draws` (
  `Draw_ID` INT NOT NULL AUTO_INCREMENT,
  `Scheme_ID` INT,
  `Group_ID` INT,
  `Draw_Date` DATE NOT NULL,
  `Draw_Type` VARCHAR(20) DEFAULT 'Monthly',
  `Draw_Name` VARCHAR(100),
  `Winner_Member_ID` BIGINT,
  `Prize_Type` VARCHAR(30),
  `Prize_Value` DECIMAL(10,2) DEFAULT '0',
  `Prize_Description` VARCHAR(200),
  `Eligible_Members` INT DEFAULT 0,
  `Notification_Sent` TINYINT(1) DEFAULT 0,
  `Conducted_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Draw_ID`),
  UNIQUE KEY `tbl_scheme_draws_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_gold_conversion`;
CREATE TABLE `tbl_scheme_gold_conversion` (
  `Conversion_ID` INT NOT NULL AUTO_INCREMENT,
  `Member_ID` BIGINT,
  `Conversion_Date` DATE NOT NULL,
  `Amount_Converted` DECIMAL(10,2) NOT NULL,
  `Gold_Rate_Used` DECIMAL(10,2) NOT NULL,
  `Gold_Weight_Credited` DECIMAL(10,3) NOT NULL,
  `Remaining_Balance` DECIMAL(10,2) DEFAULT '0',
  `Rate_Mode` VARCHAR(20) DEFAULT 'Current Rate',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Conversion_ID`),
  UNIQUE KEY `tbl_scheme_gold_conversion_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_groups`;
CREATE TABLE `tbl_scheme_groups` (
  `Group_ID` INT NOT NULL AUTO_INCREMENT,
  `Scheme_ID` INT NOT NULL,
  `Group_Code` VARCHAR(30) NOT NULL,
  `Group_Name` VARCHAR(100) NOT NULL,
  `Start_Date` DATE NOT NULL,
  `End_Date` DATE,
  `Maturity_Date` DATE,
  `Monthly_Amount` DECIMAL(10,2) NOT NULL,
  `Total_Installments` INT NOT NULL,
  `Member_Limit` INT DEFAULT 0,
  `Current_Members` INT DEFAULT 0,
  `App_Join_Allowed` TINYINT(1) DEFAULT 1,
  `Counter_Join_Allowed` TINYINT(1) DEFAULT 1,
  `Auto_Approval` TINYINT(1) DEFAULT 1,
  `Draw_Applicable` TINYINT(1) DEFAULT 0,
  `Gold_Conversion_Applicable` TINYINT(1) DEFAULT 1,
  `Bonus_Amount` DECIMAL(10,2) DEFAULT '0',
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Group_Image_URL` VARCHAR(500),
  `Group_Terms_Text` TEXT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Group_ID`),
  UNIQUE KEY `tbl_scheme_groups_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_scheme_groups_tenant_id_scheme_id_group_code_unique` (`Scheme_ID`, `Group_Code`),
  KEY `idx_group_status` (`Status`),
  KEY `idx_scheme_groups_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_installments`;
CREATE TABLE `tbl_scheme_installments` (
  `Installment_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Enrollment_ID` BIGINT NOT NULL,
  `Installment_No` INT NOT NULL,
  `Due_Date` DATE NOT NULL,
  `Paid_Date` DATE,
  `Amount` DECIMAL(10,2) NOT NULL,
  `Payment_Mode` VARCHAR(20),
  `Receipt_Number` VARCHAR(30),
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Installment_ID`),
  UNIQUE KEY `tbl_scheme_installments_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_master`;
CREATE TABLE `tbl_scheme_master` (
  `Scheme_ID` INT NOT NULL AUTO_INCREMENT,
  `Scheme_Code` VARCHAR(30) NOT NULL,
  `Scheme_Name` VARCHAR(100) NOT NULL,
  `Description` TEXT,
  `Scheme_Type` VARCHAR(20) DEFAULT 'Gold',
  `Collection_Frequency` VARCHAR(20) DEFAULT 'Monthly',
  `Installment_Mode` VARCHAR(20) DEFAULT 'Fixed',
  `Installment_Limit` VARCHAR(20) DEFAULT 'No Limit',
  `Default_Monthly_Amount` DECIMAL(10,2) DEFAULT '0',
  `Duration_Months` INT DEFAULT 11,
  `Free_Months` INT DEFAULT 1,
  `Bonus_Type` VARCHAR(20) DEFAULT 'No Bonus',
  `Bonus_Value` DECIMAL(10,2) DEFAULT '0',
  `Bonus_Product_Code` VARCHAR(50),
  `Maturity_Type` VARCHAR(30) DEFAULT 'Jewellery Purchase Only',
  `Gold_Rate_Mode` VARCHAR(20) DEFAULT 'Current Rate',
  `Penalty_Amount` DECIMAL(10,2) DEFAULT '0',
  `Grace_Days` INT DEFAULT 7,
  `Enable_Gift` TINYINT(1) DEFAULT 0,
  `Gift_Value` DECIMAL(10,2) DEFAULT '0',
  `Enable_Draw` TINYINT(1) DEFAULT 0,
  `Draw_Frequency` VARCHAR(20) DEFAULT 'Monthly',
  `Show_In_App` TINYINT(1) DEFAULT 1,
  `Introducer_Incentive_Pct` DECIMAL(5,2) DEFAULT '0',
  `Salesman_Incentive_Pct` DECIMAL(5,2) DEFAULT '0',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Scheme_ID`),
  UNIQUE KEY `tbl_scheme_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_scheme_master_tenant_id_scheme_code_unique` (`Scheme_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_members`;
CREATE TABLE `tbl_scheme_members` (
  `Member_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Member_Number` VARCHAR(30) NOT NULL,
  `Customer_ID` INT,
  `Member_Name` VARCHAR(100) NOT NULL,
  `Father_Husband_Name` VARCHAR(100),
  `DOB` DATE,
  `Anniversary` DATE,
  `Gender` VARCHAR(10),
  `Mobile` VARCHAR(15) NOT NULL,
  `WhatsApp` VARCHAR(15),
  `Email` VARCHAR(100),
  `Address_Line1` VARCHAR(200),
  `Area` VARCHAR(100),
  `City` VARCHAR(50),
  `State` VARCHAR(50),
  `Pincode` VARCHAR(10),
  `PAN_No` VARCHAR(20),
  `Aadhaar_No` VARCHAR(20),
  `GST_No` VARCHAR(20),
  `Nominee_Name` VARCHAR(100),
  `Nominee_Relation` VARCHAR(50),
  `Nominee_Mobile` VARCHAR(15),
  `Scheme_ID` INT,
  `Group_ID` INT,
  `Joining_Date` DATE NOT NULL,
  `Installment_Amount` DECIMAL(10,2) NOT NULL,
  `Installments_Paid` INT DEFAULT 0,
  `Total_Installments` INT NOT NULL,
  `Total_Amount_Paid` DECIMAL(15,2) DEFAULT '0',
  `Bonus_Amount` DECIMAL(10,2) DEFAULT '0',
  `Maturity_Value` DECIMAL(15,2) DEFAULT '0',
  `Maturity_Date` DATE,
  `Gold_Balance_Grams` DECIMAL(10,3) DEFAULT '0',
  `Introducer_Member_ID` BIGINT,
  `Salesman_User_ID` INT,
  `App_Login_Enabled` TINYINT(1) DEFAULT 0,
  `App_Device_ID` VARCHAR(200),
  `App_Last_Login` DATETIME,
  `App_FCM_Token` VARCHAR(500),
  `KYC_Status` VARCHAR(20) DEFAULT 'Pending',
  `KYC_Aadhaar_URL` VARCHAR(500),
  `KYC_PAN_URL` VARCHAR(500),
  `KYC_Photo_URL` VARCHAR(500),
  `Join_Source` VARCHAR(20) DEFAULT 'Counter',
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Redemption_Date` DATE,
  `Redemption_Sale_ID` BIGINT,
  `Closure_Reason` VARCHAR(200),
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Amount_Redeemed` DECIMAL(15,2) NOT NULL DEFAULT '0',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Member_ID`),
  UNIQUE KEY `tbl_scheme_members_member_number_unique` (`Member_Number`),
  UNIQUE KEY `tbl_scheme_members_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_member_group` (`Group_ID`),
  KEY `idx_member_mobile` (`Mobile`),
  KEY `idx_member_status` (`Status`),
  KEY `idx_scheme_members_data_mode` (`Data_Mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_notifications`;
CREATE TABLE `tbl_scheme_notifications` (
  `Notif_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Member_ID` BIGINT,
  `Type` VARCHAR(20) NOT NULL,
  `Channel` VARCHAR(20) NOT NULL,
  `Message` TEXT NOT NULL,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Sent_At` DATETIME,
  `Error_Message` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Notif_ID`),
  UNIQUE KEY `tbl_scheme_notifications_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_notif_status` (`Type`, `Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_pdc`;
CREATE TABLE `tbl_scheme_pdc` (
  `PDC_ID` INT NOT NULL AUTO_INCREMENT,
  `Member_ID` BIGINT,
  `Bank_Name` VARCHAR(100) NOT NULL,
  `Cheque_Number` VARCHAR(50) NOT NULL,
  `Amount` DECIMAL(10,2) NOT NULL,
  `Cheque_Date` DATE NOT NULL,
  `Deposit_Date` DATE,
  `Clearing_Date` DATE,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Bounce_Charge` DECIMAL(10,2) DEFAULT '0',
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`PDC_ID`),
  UNIQUE KEY `tbl_scheme_pdc_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_pdc_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_policies`;
CREATE TABLE `tbl_scheme_policies` (
  `Policy_ID` INT NOT NULL AUTO_INCREMENT,
  `Policy_Type` VARCHAR(20) NOT NULL,
  `Section_Title` VARCHAR(200) NOT NULL,
  `Section_Content` TEXT NOT NULL,
  `Sort_Order` INT DEFAULT 0,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Policy_ID`),
  UNIQUE KEY `tbl_scheme_policies_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_scheme_policies_lookup` (`Policy_Type`, `Sort_Order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_settings`;
CREATE TABLE `tbl_scheme_settings` (
  `Setting_ID` INT NOT NULL AUTO_INCREMENT,
  `Allow_Active_Scheme_Adjustment` TINYINT(1) NOT NULL DEFAULT 0,
  `Allow_Active_Scheme_Bonus` TINYINT(1) NOT NULL DEFAULT 0,
  `Updated_By` VARCHAR(50),
  `Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Setting_ID`),
  UNIQUE KEY `tbl_scheme_settings_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_scheme_transactions`;
CREATE TABLE `tbl_scheme_transactions` (
  `Txn_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Receipt_Number` VARCHAR(30) NOT NULL,
  `Member_ID` BIGINT,
  `Tenant_Member_No` VARCHAR(30),
  `Txn_Type` VARCHAR(20) DEFAULT 'Collection',
  `Installment_No` INT NOT NULL,
  `Due_Date` DATE,
  `Payment_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Amount` DECIMAL(10,2) NOT NULL,
  `Penalty_Amount` DECIMAL(10,2) DEFAULT '0',
  `Net_Amount` DECIMAL(10,2) NOT NULL,
  `Payment_Mode` VARCHAR(30) NOT NULL,
  `Payment_Reference` VARCHAR(100),
  `Bank_Name` VARCHAR(100),
  `Cheque_Number` VARCHAR(50),
  `Cheque_Date` DATE,
  `Collection_Source` VARCHAR(20) DEFAULT 'Counter',
  `Collected_By` INT,
  `Branch_ID` VARCHAR(20),
  `Is_Late` TINYINT(1) DEFAULT 0,
  `Days_Late` INT DEFAULT 0,
  `Notification_Sent` TINYINT(1) DEFAULT 0,
  `Notes` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Agent_Code` VARCHAR(30),
  `Installment_Number` INT,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Txn_ID`),
  UNIQUE KEY `tbl_scheme_transactions_receipt_number_unique` (`Receipt_Number`),
  UNIQUE KEY `tbl_scheme_transactions_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_scheme_transactions_data_mode` (`Data_Mode`),
  KEY `idx_txn_agent_code` (`Agent_Code`),
  KEY `idx_txn_date` (`Payment_Date`),
  KEY `idx_txn_member` (`Member_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_session_master`;
CREATE TABLE `tbl_session_master` (
  `Session_ID` VARCHAR(50) NOT NULL,
  `User_ID` INT,
  `Branch_ID` VARCHAR(20),
  `Current_Active_Cart_ID` BIGINT,
  `Is_Customer_Screen_Open` TINYINT(1) DEFAULT 0,
  `Customer_Screen_Session_ID` VARCHAR(50),
  `Session_Start` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Last_Activity` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Session_End` DATETIME,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `IP_Address` VARCHAR(50),
  `Device_Info` TEXT,
  `Counter_ID` INT,
  `Counter_Name` VARCHAR(50),
  `Counter_Window_ID` VARCHAR(50),
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Session_ID`),
  UNIQUE KEY `tbl_session_master_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sms_gateway_config`;
CREATE TABLE `tbl_sms_gateway_config` (
  `Config_ID` INT NOT NULL AUTO_INCREMENT,
  `Provider` VARCHAR(30) NOT NULL DEFAULT 'asterix',
  `Api_Base_Url` VARCHAR(255) NOT NULL,
  `Api_User` VARCHAR(100) NOT NULL,
  `Api_Key` VARCHAR(150) NOT NULL,
  `Sender_Id` VARCHAR(20) NOT NULL,
  `Entity_Id` VARCHAR(50) NOT NULL,
  `Account_Usage` VARCHAR(10) DEFAULT '1',
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Config_ID`),
  UNIQUE KEY `tbl_sms_gateway_config_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `uq_sms_gateway_tenant_provider` (`Provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sms_log`;
CREATE TABLE `tbl_sms_log` (
  `Log_ID` INT NOT NULL AUTO_INCREMENT,
  `Mobile` VARCHAR(15) NOT NULL,
  `Purpose` VARCHAR(30) NOT NULL,
  `Message` TEXT NOT NULL,
  `Status` VARCHAR(20) NOT NULL,
  `Provider_Response` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Log_ID`),
  UNIQUE KEY `tbl_sms_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_sms_log_tenant_date` (`Created_Date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sms_templates`;
CREATE TABLE `tbl_sms_templates` (
  `Template_ID` INT NOT NULL AUTO_INCREMENT,
  `Purpose` VARCHAR(30) NOT NULL,
  `Dlt_Template_Id` VARCHAR(50) NOT NULL,
  `Template_Text` TEXT NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Template_ID`),
  UNIQUE KEY `tbl_sms_templates_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `uq_sms_template_tenant_purpose` (`Purpose`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_stock_transfer`;
CREATE TABLE `tbl_stock_transfer` (
  `Transfer_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Transfer_Number` VARCHAR(30) NOT NULL,
  `Transfer_Type` VARCHAR(20) NOT NULL,
  `Transfer_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `From_Branch_ID` VARCHAR(20),
  `From_Floor_ID` INT,
  `From_Counter_ID` INT,
  `To_Branch_ID` VARCHAR(20),
  `To_Floor_ID` INT,
  `To_Counter_ID` INT,
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Approved_By` VARCHAR(50),
  `Approved_Date` DATETIME,
  `Remarks` TEXT,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Data_Mode` SMALLINT NOT NULL DEFAULT '3',
  `From_Tray_ID` INT,
  `To_Tray_ID` INT,
  `To_Hidden_Location_ID` INT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Transfer_ID`),
  UNIQUE KEY `tbl_stock_transfer_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_stock_transfer_transfer_number_unique` (`Transfer_Number`),
  KEY `idx_stock_transfer_data_mode` (`Data_Mode`),
  KEY `idx_transfer_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_stock_transfer_items`;
CREATE TABLE `tbl_stock_transfer_items` (
  `Item_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Transfer_ID` BIGINT NOT NULL,
  `Ornament_ID` BIGINT,
  `Article_Number` VARCHAR(50),
  `Gross_Weight` DECIMAL(10,3),
  `Status` VARCHAR(20) DEFAULT 'Pending',
  `Remarks` TEXT,
  PRIMARY KEY (`Item_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sub_category_master`;
CREATE TABLE `tbl_sub_category_master` (
  `SubCat_ID` INT NOT NULL AUTO_INCREMENT,
  `Type_ID` INT,
  `SubCat_Code` VARCHAR(30) NOT NULL,
  `SubCat_Name` VARCHAR(100) NOT NULL,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`SubCat_ID`),
  UNIQUE KEY `tbl_sub_category_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_sub_category_master_tenant_id_subcat_code_unique` (`SubCat_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sync_log`;
CREATE TABLE `tbl_sync_log` (
  `Log_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Device_ID` VARCHAR(50),
  `Table_Name` VARCHAR(60) NOT NULL,
  `Record_Sync_UUID` CHAR(36),
  `Direction` VARCHAR(20) NOT NULL,
  `Status` VARCHAR(20) NOT NULL,
  `Conflict_Resolution` VARCHAR(20),
  `Error_Message` TEXT,
  `Synced_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Log_ID`),
  KEY `idx_sync_log_status` (`Status`),
  KEY `idx_sync_log_sync_uuid` (`Record_Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_sync_queue`;
CREATE TABLE `tbl_sync_queue` (
  `Queue_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20),
  `Device_ID` VARCHAR(50) NOT NULL,
  `Table_Name` VARCHAR(60) NOT NULL,
  `Record_ID` BIGINT NOT NULL,
  `Record_Sync_UUID` CHAR(36) NOT NULL,
  `Operation` VARCHAR(10) NOT NULL,
  `Payload` JSON,
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Retry_Count` INT DEFAULT 0,
  `Error_Message` TEXT,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Synced_Date` DATETIME,
  PRIMARY KEY (`Queue_ID`),
  KEY `idx_sync_queue_device` (`Device_ID`),
  KEY `idx_sync_queue_record` (`Table_Name`, `Record_ID`),
  KEY `idx_sync_queue_status` (`Status`),
  KEY `idx_sync_queue_sync_uuid` (`Record_Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_tally_config`;
CREATE TABLE `tbl_tally_config` (
  `Config_ID` INT NOT NULL AUTO_INCREMENT,
  `Tally_Company_Name` VARCHAR(100),
  `Tally_Company_GUID` VARCHAR(100),
  `Sync_Enabled` TINYINT(1) DEFAULT 0,
  `Sync_Direction` VARCHAR(20) DEFAULT 'Export Only',
  `Server_IP` VARCHAR(50),
  `Server_Port` INT DEFAULT 9000,
  `Mapping_JSON` JSON,
  `Last_Sync_Date` DATETIME,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Config_ID`),
  UNIQUE KEY `tbl_tally_config_sync_uuid_unique` (`Sync_UUID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_tally_sync_log`;
CREATE TABLE `tbl_tally_sync_log` (
  `Log_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `Sync_Type` VARCHAR(20) NOT NULL,
  `Reference_Table` VARCHAR(60),
  `Reference_ID` BIGINT,
  `Tally_Voucher_GUID` VARCHAR(100),
  `Status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
  `Error_Message` TEXT,
  `Synced_Date` DATETIME,
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Log_ID`),
  UNIQUE KEY `tbl_tally_sync_log_sync_uuid_unique` (`Sync_UUID`),
  KEY `idx_tally_sync_reference` (`Reference_Table`, `Reference_ID`),
  KEY `idx_tally_sync_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_tray_master`;
CREATE TABLE `tbl_tray_master` (
  `Tray_ID` INT NOT NULL AUTO_INCREMENT,
  `Branch_ID` VARCHAR(20) NOT NULL,
  `Floor_ID` INT NOT NULL,
  `Counter_ID` INT NOT NULL,
  `Tray_Code` VARCHAR(20) NOT NULL,
  `Tray_Name` VARCHAR(100) NOT NULL,
  `Capacity` INT DEFAULT 20,
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Tray_ID`),
  UNIQUE KEY `tbl_tray_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_tray_master_tenant_id_branch_id_counter_id_tray_code_unique` (`Branch_ID`, `Counter_ID`, `Tray_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_user_bin_access`;
CREATE TABLE `tbl_user_bin_access` (
  `Access_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `User_ID` INT NOT NULL,
  `Tray_ID` INT,
  `Hidden_Location_ID` INT,
  `Access_Level` VARCHAR(20) DEFAULT 'View',
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Access_ID`),
  KEY `idx_user_bin_access_user` (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_user_master`;
CREATE TABLE `tbl_user_master` (
  `User_ID` INT NOT NULL AUTO_INCREMENT,
  `Username` VARCHAR(50) NOT NULL,
  `Password_Hash` VARCHAR(255) NOT NULL,
  `Password_Salt` VARCHAR(50) NOT NULL,
  `Role_ID` INT,
  `Employee_ID` VARCHAR(30),
  `Full_Name` VARCHAR(100) NOT NULL,
  `Email` VARCHAR(100),
  `Mobile` VARCHAR(15),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Is_Admin` TINYINT(1) DEFAULT 0,
  `Last_Login_IP` VARCHAR(50),
  `Last_Login_Date` DATETIME,
  `Login_Attempts` INT DEFAULT 0,
  `Locked_Until` DATETIME,
  `Can_Open_Customer_Display` TINYINT(1) DEFAULT 1,
  `Can_Edit_Invoice_Template` TINYINT(1) DEFAULT 0,
  `Can_Manage_Karigar` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Custom_Permissions` JSON,
  `Employee_Code` VARCHAR(30),
  `Department` VARCHAR(100),
  `Branch_ID` VARCHAR(50),
  `Default_Password` VARCHAR(100),
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`User_ID`),
  UNIQUE KEY `tbl_user_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_user_master_tenant_id_username_unique` (`Username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_user_permission_override`;
CREATE TABLE `tbl_user_permission_override` (
  `Override_ID` BIGINT NOT NULL AUTO_INCREMENT,
  `User_ID` INT NOT NULL,
  `Module_Key` VARCHAR(50) NOT NULL,
  `Can_View` TINYINT(1) DEFAULT 1,
  `Can_Add` TINYINT(1) DEFAULT 0,
  `Can_Edit` TINYINT(1) DEFAULT 0,
  `Can_Delete` TINYINT(1) DEFAULT 0,
  `Can_Approve` TINYINT(1) DEFAULT 0,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Override_ID`),
  UNIQUE KEY `tbl_user_permission_override_user_id_module_key_unique` (`User_ID`, `Module_Key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_vendor_master`;
CREATE TABLE `tbl_vendor_master` (
  `Vendor_ID` INT NOT NULL AUTO_INCREMENT,
  `Vendor_Type` VARCHAR(20) NOT NULL,
  `Vendor_Code` VARCHAR(30) NOT NULL,
  `Vendor_Name` VARCHAR(100) NOT NULL,
  `Contact_Person` VARCHAR(50),
  `Mobile_1` VARCHAR(15) NOT NULL,
  `Mobile_2` VARCHAR(15),
  `Email` VARCHAR(100),
  `Address_Line1` VARCHAR(200),
  `Address_Line2` VARCHAR(200),
  `City` VARCHAR(50),
  `State` VARCHAR(50),
  `Pincode` VARCHAR(10),
  `GST_No` VARCHAR(20),
  `PAN_No` VARCHAR(20),
  `Bank_Name` VARCHAR(50),
  `Bank_Account_No` VARCHAR(30),
  `IFSC_Code` VARCHAR(20),
  `Opening_Balance` DECIMAL(15,2) DEFAULT '0',
  `Current_Balance` DECIMAL(15,2) DEFAULT '0',
  `Credit_Limit` DECIMAL(15,2),
  `Credit_Days` INT DEFAULT 30,
  `Karigar_Skill` VARCHAR(30),
  `Karigar_Experience_Years` INT,
  `Karigar_Daily_Capacity` INT,
  `Karigar_Wastage_Allowed_Percent` DECIMAL(5,2),
  `Is_Active` TINYINT(1) DEFAULT 1,
  `Created_By` VARCHAR(50),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Modified_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Notes` TEXT,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Vendor_ID`),
  UNIQUE KEY `tbl_vendor_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_vendor_master_vendor_code_unique` (`Vendor_Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tbl_voucher_master`;
CREATE TABLE `tbl_voucher_master` (
  `Voucher_PK` INT NOT NULL AUTO_INCREMENT,
  `Voucher_ID` VARCHAR(50) NOT NULL,
  `Voucher_Type` VARCHAR(20) NOT NULL,
  `Reference_ID` INT,
  `Reference_Table` VARCHAR(60),
  `Status` VARCHAR(20) DEFAULT 'Active',
  `Description` TEXT,
  `Created_By` VARCHAR(100),
  `Created_Date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Sync_UUID` CHAR(36) NOT NULL DEFAULT (UUID()),
  PRIMARY KEY (`Voucher_PK`),
  UNIQUE KEY `tbl_voucher_master_sync_uuid_unique` (`Sync_UUID`),
  UNIQUE KEY `tbl_voucher_master_voucher_id_unique` (`Voucher_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Foreign keys (added after every table exists — avoids needing to
-- topologically sort CREATE TABLE order for circular/forward references).
-- ============================================================================
ALTER TABLE `tbl_accounting_entries` ADD CONSTRAINT `tbl_accounting_entries_journal_id_foreign` FOREIGN KEY (`Journal_ID`) REFERENCES `tbl_accounting_journal`(`Journal_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_agent_commission_transactions` ADD CONSTRAINT `tbl_agent_commission_transactions_agent_id_foreign` FOREIGN KEY (`Agent_ID`) REFERENCES `tbl_agent_master`(`Agent_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_amc_enrollment` ADD CONSTRAINT `tbl_amc_enrollment_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_amc_enrollment` ADD CONSTRAINT `tbl_amc_enrollment_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_amc_enrollment` ADD CONSTRAINT `tbl_amc_enrollment_plan_id_foreign` FOREIGN KEY (`Plan_ID`) REFERENCES `tbl_amc_plan_master`(`Plan_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_amc_enrollment` ADD CONSTRAINT `tbl_amc_enrollment_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_issue_header` ADD CONSTRAINT `tbl_approval_issue_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_issue_header` ADD CONSTRAINT `tbl_approval_issue_header_party_id_foreign` FOREIGN KEY (`Party_ID`) REFERENCES `tbl_approval_party_master`(`Party_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_issue_items` ADD CONSTRAINT `tbl_approval_issue_items_issue_id_foreign` FOREIGN KEY (`Issue_ID`) REFERENCES `tbl_approval_issue_header`(`Issue_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_approval_issue_items` ADD CONSTRAINT `tbl_approval_issue_items_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_issue_items` ADD CONSTRAINT `tbl_approval_issue_items_received_in_receive_id_foreign` FOREIGN KEY (`Received_In_Receive_ID`) REFERENCES `tbl_approval_receive_header`(`Receive_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_receive_header` ADD CONSTRAINT `tbl_approval_receive_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_approval_receive_header` ADD CONSTRAINT `tbl_approval_receive_header_issue_id_foreign` FOREIGN KEY (`Issue_ID`) REFERENCES `tbl_approval_issue_header`(`Issue_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_attendance` ADD CONSTRAINT `tbl_attendance_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_bank_account_master` ADD CONSTRAINT `tbl_bank_account_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_bom_department_stages` ADD CONSTRAINT `tbl_bom_department_stages_bom_id_foreign` FOREIGN KEY (`BOM_ID`) REFERENCES `tbl_bom_master`(`BOM_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_bom_department_stages` ADD CONSTRAINT `tbl_bom_department_stages_dept_id_foreign` FOREIGN KEY (`Dept_ID`) REFERENCES `tbl_production_department_master`(`Dept_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_bom_master` ADD CONSTRAINT `tbl_bom_master_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_bom_master` ADD CONSTRAINT `tbl_bom_master_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_catalog_order_items` ADD CONSTRAINT `tbl_catalog_order_items_order_id_foreign` FOREIGN KEY (`Order_ID`) REFERENCES `tbl_catalog_orders`(`Order_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_catalog_wishlist` ADD CONSTRAINT `tbl_catalog_wishlist_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_cheque_register` ADD CONSTRAINT `tbl_cheque_register_account_id_foreign` FOREIGN KEY (`Account_ID`) REFERENCES `tbl_bank_account_master`(`Account_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_counter_master` ADD CONSTRAINT `tbl_counter_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_counter_master` ADD CONSTRAINT `tbl_counter_master_floor_id_foreign` FOREIGN KEY (`Floor_ID`) REFERENCES `tbl_floor_master`(`Floor_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_crm_followup` ADD CONSTRAINT `tbl_crm_followup_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_crm_followup` ADD CONSTRAINT `tbl_crm_followup_done_by_foreign` FOREIGN KEY (`Done_By`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_crm_followup` ADD CONSTRAINT `tbl_crm_followup_lead_id_foreign` FOREIGN KEY (`Lead_ID`) REFERENCES `tbl_crm_lead`(`Lead_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_crm_lead` ADD CONSTRAINT `tbl_crm_lead_assigned_to_foreign` FOREIGN KEY (`Assigned_To`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_crm_lead` ADD CONSTRAINT `tbl_crm_lead_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_crm_lead` ADD CONSTRAINT `tbl_crm_lead_converted_customer_id_foreign` FOREIGN KEY (`Converted_Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_custom_order` ADD CONSTRAINT `tbl_custom_order_assigned_karigar_id_foreign` FOREIGN KEY (`Assigned_Karigar_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_custom_order` ADD CONSTRAINT `tbl_custom_order_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_custom_order` ADD CONSTRAINT `tbl_custom_order_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_display_settings` ADD CONSTRAINT `tbl_customer_display_settings_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_feedback` ADD CONSTRAINT `tbl_customer_feedback_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_feedback` ADD CONSTRAINT `tbl_customer_feedback_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_insurance` ADD CONSTRAINT `tbl_customer_insurance_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_insurance` ADD CONSTRAINT `tbl_customer_insurance_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_insurance` ADD CONSTRAINT `tbl_customer_insurance_policy_id_foreign` FOREIGN KEY (`Policy_ID`) REFERENCES `tbl_insurance_policy_master`(`Policy_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_customer_insurance` ADD CONSTRAINT `tbl_customer_insurance_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_day_close` ADD CONSTRAINT `tbl_day_close_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_day_close` ADD CONSTRAINT `tbl_day_close_closed_by_foreign` FOREIGN KEY (`Closed_By`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_design_master` ADD CONSTRAINT `tbl_design_master_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_einvoice_log` ADD CONSTRAINT `tbl_einvoice_log_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_employee_details` ADD CONSTRAINT `tbl_employee_details_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_floor_master` ADD CONSTRAINT `tbl_floor_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_gem_certificate` ADD CONSTRAINT `tbl_gem_certificate_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_gem_certificate` ADD CONSTRAINT `tbl_gem_certificate_stone_id_foreign` FOREIGN KEY (`Stone_ID`) REFERENCES `tbl_gemstone_master`(`Stone_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_gift_vouchers` ADD CONSTRAINT `tbl_gift_vouchers_issued_to_customer_id_foreign` FOREIGN KEY (`Issued_To_Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_gift_vouchers` ADD CONSTRAINT `tbl_gift_vouchers_used_in_sale_id_foreign` FOREIGN KEY (`Used_In_Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_holiday_master` ADD CONSTRAINT `tbl_holiday_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_huid_master` ADD CONSTRAINT `tbl_huid_master_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_invoice_template_master` ADD CONSTRAINT `tbl_invoice_template_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_issue_to_karigar` ADD CONSTRAINT `tbl_issue_to_karigar_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_issue_to_karigar` ADD CONSTRAINT `tbl_issue_to_karigar_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_issue_to_karigar` ADD CONSTRAINT `tbl_issue_to_karigar_karigar_id_foreign` FOREIGN KEY (`Karigar_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_issue_to_karigar` ADD CONSTRAINT `tbl_issue_to_karigar_purity_id_foreign` FOREIGN KEY (`Purity_ID`) REFERENCES `tbl_purity_master`(`Purity_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_loyalty_transactions` ADD CONSTRAINT `tbl_loyalty_transactions_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_loyalty_transactions` ADD CONSTRAINT `tbl_loyalty_transactions_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_making_charge_master` ADD CONSTRAINT `tbl_making_charge_master_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_melting_refining_log` ADD CONSTRAINT `tbl_melting_refining_log_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_melting_refining_log` ADD CONSTRAINT `tbl_melting_refining_log_refiner_vendor_id_foreign` FOREIGN KEY (`Refiner_Vendor_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_mould_bom_stock` ADD CONSTRAINT `tbl_mould_bom_stock_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_header` ADD CONSTRAINT `tbl_non_tag_issue_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_header` ADD CONSTRAINT `tbl_non_tag_issue_header_party_id_foreign` FOREIGN KEY (`Party_ID`) REFERENCES `tbl_approval_party_master`(`Party_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_items` ADD CONSTRAINT `tbl_non_tag_issue_items_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_items` ADD CONSTRAINT `tbl_non_tag_issue_items_nta_issue_id_foreign` FOREIGN KEY (`NTA_Issue_ID`) REFERENCES `tbl_non_tag_issue_header`(`NTA_Issue_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_non_tag_issue_items` ADD CONSTRAINT `tbl_non_tag_issue_items_purity_id_foreign` FOREIGN KEY (`Purity_ID`) REFERENCES `tbl_purity_master`(`Purity_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_items` ADD CONSTRAINT `tbl_non_tag_issue_items_received_in_receive_id_foreign` FOREIGN KEY (`Received_In_Receive_ID`) REFERENCES `tbl_non_tag_receive_header`(`NTA_Receive_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_issue_items` ADD CONSTRAINT `tbl_non_tag_issue_items_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_receive_header` ADD CONSTRAINT `tbl_non_tag_receive_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_non_tag_receive_header` ADD CONSTRAINT `tbl_non_tag_receive_header_nta_issue_id_foreign` FOREIGN KEY (`NTA_Issue_ID`) REFERENCES `tbl_non_tag_issue_header`(`NTA_Issue_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_old_gold_exchange` ADD CONSTRAINT `tbl_old_gold_exchange_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_old_gold_exchange` ADD CONSTRAINT `tbl_old_gold_exchange_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_approval_issue_id_foreign` FOREIGN KEY (`Approval_Issue_ID`) REFERENCES `tbl_approval_issue_header`(`Issue_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_approval_receive_id_foreign` FOREIGN KEY (`Approval_Receive_ID`) REFERENCES `tbl_approval_receive_header`(`Receive_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_brand_id_foreign` FOREIGN KEY (`Brand_ID`) REFERENCES `tbl_brand_master`(`Brand_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_collection_id_foreign` FOREIGN KEY (`Collection_ID`) REFERENCES `tbl_collection_master`(`Collection_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_counter_id_foreign` FOREIGN KEY (`Counter_ID`) REFERENCES `tbl_counter_master`(`Counter_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_floor_id_foreign` FOREIGN KEY (`Floor_ID`) REFERENCES `tbl_floor_master`(`Floor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_hidden_location_id_foreign` FOREIGN KEY (`Hidden_Location_ID`) REFERENCES `tbl_hidden_location_master`(`Hidden_Location_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_karigar_id_foreign` FOREIGN KEY (`Karigar_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_mc_id_foreign` FOREIGN KEY (`MC_ID`) REFERENCES `tbl_making_charge_master`(`MC_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_purity_id_foreign` FOREIGN KEY (`Purity_ID`) REFERENCES `tbl_purity_master`(`Purity_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_stone_id_foreign` FOREIGN KEY (`Stone_ID`) REFERENCES `tbl_gemstone_master`(`Stone_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_subcat_id_foreign` FOREIGN KEY (`SubCat_ID`) REFERENCES `tbl_sub_category_master`(`SubCat_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_supplier_id_foreign` FOREIGN KEY (`Supplier_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_tray_id_foreign` FOREIGN KEY (`Tray_ID`) REFERENCES `tbl_tray_master`(`Tray_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_ornament_master` ADD CONSTRAINT `tbl_ornament_master_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_pawn_loan_guarantor` ADD CONSTRAINT `tbl_pawn_loan_guarantor_loan_id_foreign` FOREIGN KEY (`Loan_ID`) REFERENCES `tbl_pawn_loan_header`(`Loan_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_pawn_loan_header` ADD CONSTRAINT `tbl_pawn_loan_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_pawn_loan_header` ADD CONSTRAINT `tbl_pawn_loan_header_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_pawn_loan_items` ADD CONSTRAINT `tbl_pawn_loan_items_loan_id_foreign` FOREIGN KEY (`Loan_ID`) REFERENCES `tbl_pawn_loan_header`(`Loan_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_pawn_loan_items` ADD CONSTRAINT `tbl_pawn_loan_items_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_pawn_loan_transactions` ADD CONSTRAINT `tbl_pawn_loan_transactions_loan_id_foreign` FOREIGN KEY (`Loan_ID`) REFERENCES `tbl_pawn_loan_header`(`Loan_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_payroll_details` ADD CONSTRAINT `tbl_payroll_details_run_id_foreign` FOREIGN KEY (`Run_ID`) REFERENCES `tbl_payroll_run`(`Run_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_payroll_details` ADD CONSTRAINT `tbl_payroll_details_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_payroll_run` ADD CONSTRAINT `tbl_payroll_run_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_printer_config` ADD CONSTRAINT `tbl_printer_config_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_product_images` ADD CONSTRAINT `tbl_product_images_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_production_transaction` ADD CONSTRAINT `tbl_production_transaction_bom_id_foreign` FOREIGN KEY (`BOM_ID`) REFERENCES `tbl_bom_master`(`BOM_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_production_transaction` ADD CONSTRAINT `tbl_production_transaction_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_production_transaction` ADD CONSTRAINT `tbl_production_transaction_dept_id_foreign` FOREIGN KEY (`Dept_ID`) REFERENCES `tbl_production_department_master`(`Dept_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_production_transaction` ADD CONSTRAINT `tbl_production_transaction_karigar_id_foreign` FOREIGN KEY (`Karigar_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_production_transaction` ADD CONSTRAINT `tbl_production_transaction_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_purchase_details` ADD CONSTRAINT `tbl_purchase_details_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_purchase_details` ADD CONSTRAINT `tbl_purchase_details_purchase_id_foreign` FOREIGN KEY (`Purchase_ID`) REFERENCES `tbl_purchase_header`(`Purchase_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_purchase_details` ADD CONSTRAINT `tbl_purchase_details_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_purchase_header` ADD CONSTRAINT `tbl_purchase_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_purchase_header` ADD CONSTRAINT `tbl_purchase_header_supplier_id_foreign` FOREIGN KEY (`Supplier_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_rate_booking` ADD CONSTRAINT `tbl_rate_booking_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_rate_booking` ADD CONSTRAINT `tbl_rate_booking_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_rate_booking` ADD CONSTRAINT `tbl_rate_booking_utilized_sale_id_foreign` FOREIGN KEY (`Utilized_Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_reorder_request` ADD CONSTRAINT `tbl_reorder_request_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_reorder_request` ADD CONSTRAINT `tbl_reorder_request_design_id_foreign` FOREIGN KEY (`Design_ID`) REFERENCES `tbl_design_master`(`Design_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_reorder_request` ADD CONSTRAINT `tbl_reorder_request_fulfilled_purchase_id_foreign` FOREIGN KEY (`Fulfilled_Purchase_ID`) REFERENCES `tbl_purchase_header`(`Purchase_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_reorder_request` ADD CONSTRAINT `tbl_reorder_request_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_repair_orders` ADD CONSTRAINT `tbl_repair_orders_assigned_karigar_id_foreign` FOREIGN KEY (`Assigned_Karigar_ID`) REFERENCES `tbl_vendor_master`(`Vendor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_repair_orders` ADD CONSTRAINT `tbl_repair_orders_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_repair_orders` ADD CONSTRAINT `tbl_repair_orders_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_return_from_karigar` ADD CONSTRAINT `tbl_return_from_karigar_issue_id_foreign` FOREIGN KEY (`Issue_ID`) REFERENCES `tbl_issue_to_karigar`(`Issue_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_return_from_karigar` ADD CONSTRAINT `tbl_return_from_karigar_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_rfid_scan_log` ADD CONSTRAINT `tbl_rfid_scan_log_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_rfid_scan_log` ADD CONSTRAINT `tbl_rfid_scan_log_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_salary_structure` ADD CONSTRAINT `tbl_salary_structure_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_sales_details` ADD CONSTRAINT `tbl_sales_details_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_details` ADD CONSTRAINT `tbl_sales_details_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_sales_header` ADD CONSTRAINT `tbl_sales_header_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_header` ADD CONSTRAINT `tbl_sales_header_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_incentive_transactions` ADD CONSTRAINT `tbl_sales_incentive_transactions_payroll_run_id_foreign` FOREIGN KEY (`Payroll_Run_ID`) REFERENCES `tbl_payroll_run`(`Run_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_incentive_transactions` ADD CONSTRAINT `tbl_sales_incentive_transactions_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_sales_incentive_transactions` ADD CONSTRAINT `tbl_sales_incentive_transactions_slab_id_foreign` FOREIGN KEY (`Slab_ID`) REFERENCES `tbl_incentive_slab_master`(`Slab_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_incentive_transactions` ADD CONSTRAINT `tbl_sales_incentive_transactions_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sales_payments` ADD CONSTRAINT `tbl_sales_payments_sale_id_foreign` FOREIGN KEY (`Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_sales_payments` ADD CONSTRAINT `tbl_sales_payments_voucher_id_foreign` FOREIGN KEY (`Voucher_ID`) REFERENCES `tbl_gift_vouchers`(`Voucher_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_saving_scheme_enrollment` ADD CONSTRAINT `tbl_saving_scheme_enrollment_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_saving_scheme_enrollment` ADD CONSTRAINT `tbl_saving_scheme_enrollment_redemption_sale_id_foreign` FOREIGN KEY (`Redemption_Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_saving_scheme_enrollment` ADD CONSTRAINT `tbl_saving_scheme_enrollment_scheme_id_foreign` FOREIGN KEY (`Scheme_ID`) REFERENCES `tbl_saving_scheme_master`(`Scheme_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_bonuses` ADD CONSTRAINT `tbl_scheme_bonuses_member_id_foreign` FOREIGN KEY (`Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_draws` ADD CONSTRAINT `tbl_scheme_draws_group_id_foreign` FOREIGN KEY (`Group_ID`) REFERENCES `tbl_scheme_groups`(`Group_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_draws` ADD CONSTRAINT `tbl_scheme_draws_scheme_id_foreign` FOREIGN KEY (`Scheme_ID`) REFERENCES `tbl_scheme_master`(`Scheme_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_draws` ADD CONSTRAINT `tbl_scheme_draws_winner_member_id_foreign` FOREIGN KEY (`Winner_Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_gold_conversion` ADD CONSTRAINT `tbl_scheme_gold_conversion_member_id_foreign` FOREIGN KEY (`Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_groups` ADD CONSTRAINT `tbl_scheme_groups_scheme_id_foreign` FOREIGN KEY (`Scheme_ID`) REFERENCES `tbl_scheme_master`(`Scheme_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_installments` ADD CONSTRAINT `tbl_scheme_installments_enrollment_id_foreign` FOREIGN KEY (`Enrollment_ID`) REFERENCES `tbl_saving_scheme_enrollment`(`Enrollment_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_members` ADD CONSTRAINT `tbl_scheme_members_customer_id_foreign` FOREIGN KEY (`Customer_ID`) REFERENCES `tbl_customer_master`(`Customer_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_members` ADD CONSTRAINT `tbl_scheme_members_group_id_foreign` FOREIGN KEY (`Group_ID`) REFERENCES `tbl_scheme_groups`(`Group_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_members` ADD CONSTRAINT `tbl_scheme_members_redemption_sale_id_foreign` FOREIGN KEY (`Redemption_Sale_ID`) REFERENCES `tbl_sales_header`(`Sale_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_members` ADD CONSTRAINT `tbl_scheme_members_salesman_user_id_foreign` FOREIGN KEY (`Salesman_User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_members` ADD CONSTRAINT `tbl_scheme_members_scheme_id_foreign` FOREIGN KEY (`Scheme_ID`) REFERENCES `tbl_scheme_master`(`Scheme_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_notifications` ADD CONSTRAINT `tbl_scheme_notifications_member_id_foreign` FOREIGN KEY (`Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_pdc` ADD CONSTRAINT `tbl_scheme_pdc_member_id_foreign` FOREIGN KEY (`Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_scheme_transactions` ADD CONSTRAINT `tbl_scheme_transactions_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_transactions` ADD CONSTRAINT `tbl_scheme_transactions_collected_by_foreign` FOREIGN KEY (`Collected_By`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_scheme_transactions` ADD CONSTRAINT `tbl_scheme_transactions_member_id_foreign` FOREIGN KEY (`Member_ID`) REFERENCES `tbl_scheme_members`(`Member_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_session_master` ADD CONSTRAINT `tbl_session_master_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_from_branch_id_foreign` FOREIGN KEY (`From_Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_from_counter_id_foreign` FOREIGN KEY (`From_Counter_ID`) REFERENCES `tbl_counter_master`(`Counter_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_from_floor_id_foreign` FOREIGN KEY (`From_Floor_ID`) REFERENCES `tbl_floor_master`(`Floor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_from_tray_id_foreign` FOREIGN KEY (`From_Tray_ID`) REFERENCES `tbl_tray_master`(`Tray_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_to_branch_id_foreign` FOREIGN KEY (`To_Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_to_counter_id_foreign` FOREIGN KEY (`To_Counter_ID`) REFERENCES `tbl_counter_master`(`Counter_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_to_floor_id_foreign` FOREIGN KEY (`To_Floor_ID`) REFERENCES `tbl_floor_master`(`Floor_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_to_hidden_location_id_foreign` FOREIGN KEY (`To_Hidden_Location_ID`) REFERENCES `tbl_hidden_location_master`(`Hidden_Location_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer` ADD CONSTRAINT `tbl_stock_transfer_to_tray_id_foreign` FOREIGN KEY (`To_Tray_ID`) REFERENCES `tbl_tray_master`(`Tray_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer_items` ADD CONSTRAINT `tbl_stock_transfer_items_ornament_id_foreign` FOREIGN KEY (`Ornament_ID`) REFERENCES `tbl_ornament_master`(`Ornament_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_stock_transfer_items` ADD CONSTRAINT `tbl_stock_transfer_items_transfer_id_foreign` FOREIGN KEY (`Transfer_ID`) REFERENCES `tbl_stock_transfer`(`Transfer_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_sub_category_master` ADD CONSTRAINT `tbl_sub_category_master_type_id_foreign` FOREIGN KEY (`Type_ID`) REFERENCES `tbl_item_type_master`(`Type_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_sync_queue` ADD CONSTRAINT `tbl_sync_queue_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_tray_master` ADD CONSTRAINT `tbl_tray_master_branch_id_foreign` FOREIGN KEY (`Branch_ID`) REFERENCES `tbl_branch_master`(`Branch_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_tray_master` ADD CONSTRAINT `tbl_tray_master_counter_id_foreign` FOREIGN KEY (`Counter_ID`) REFERENCES `tbl_counter_master`(`Counter_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_tray_master` ADD CONSTRAINT `tbl_tray_master_floor_id_foreign` FOREIGN KEY (`Floor_ID`) REFERENCES `tbl_floor_master`(`Floor_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_user_bin_access` ADD CONSTRAINT `tbl_user_bin_access_hidden_location_id_foreign` FOREIGN KEY (`Hidden_Location_ID`) REFERENCES `tbl_hidden_location_master`(`Hidden_Location_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_user_bin_access` ADD CONSTRAINT `tbl_user_bin_access_tray_id_foreign` FOREIGN KEY (`Tray_ID`) REFERENCES `tbl_tray_master`(`Tray_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_user_bin_access` ADD CONSTRAINT `tbl_user_bin_access_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;
ALTER TABLE `tbl_user_master` ADD CONSTRAINT `tbl_user_master_role_id_foreign` FOREIGN KEY (`Role_ID`) REFERENCES `tbl_role_master`(`Role_ID`) ON DELETE SET NULL;
ALTER TABLE `tbl_user_permission_override` ADD CONSTRAINT `tbl_user_permission_override_user_id_foreign` FOREIGN KEY (`User_ID`) REFERENCES `tbl_user_master`(`User_ID`) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
