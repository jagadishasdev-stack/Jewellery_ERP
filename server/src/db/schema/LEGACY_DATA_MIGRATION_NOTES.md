# Legacy → New Schema Data Migration Notes

Maps tables from the old desktop ERP dump (`njm21052026.sql`, MySQL/MariaDB,
435 tables) onto this project's current schema (`postgres_cloud_schema.sql` /
`mysql_local_schema.sql`, 119 / 112 tables). Use this as the field-mapping
reference when writing the actual ETL/import script — it is not itself an
import tool.

## How to read this
- **Legacy table → New table** — the destination table(s) for that legacy
  table's rows.
- Legacy column names are lowercase/snake-ish and inconsistent (`billno`,
  `WORKER`, `mc`); new column names are always `PascalCase_With_Underscores`.
  Only non-obvious renames are called out — most fields map by meaning, not
  name (e.g. legacy `gross` → `Gross_Weight`).
- **Tenant_ID / Branch_ID**: the legacy database has no multi-tenancy concept
  at all (it *is* one shop's database). When importing into the **cloud**
  schema, every row needs a `Tenant_ID` backfilled to whichever tenant this
  shop was provisioned as (and `Branch_ID` if the shop has more than one
  legacy `branch` row — map legacy `branch.id` → new `Branch_ID`). When
  importing into the **local MySQL** schema, drop `Tenant_ID` entirely (it
  doesn't exist there) and keep only `Branch_ID`.
- **Surrogate keys**: the legacy schema often uses a natural key as the
  primary key (e.g. `sale.billno` is the PK). The new schema always has a
  surrogate `_ID` primary key plus the natural key as a separate unique
  column (e.g. `tbl_sales_header.Sale_ID` PK + `Invoice_Number` unique) — the
  import script must generate new surrogate IDs and remap every FK reference
  to the old natural key into the new surrogate ID.
- **Data_Mode**: new financial tables carry a `Data_Mode` column
  (1=Dummy, 2=Unofficial, 3=Official) that the legacy schema has no
  equivalent of — default every imported row to `3` (Official) unless the
  business specifically ran a kachha/pucca dual-books setup on the old
  system that needs to be preserved.

## Suggested import order (respects FK dependencies)
1. Masters with no dependencies: `metaltype`→`tbl_purity_master`+item type
   split, `itemtype`→`tbl_item_type_master`, `category`→`tbl_sub_category_master`,
   `design`→`tbl_design_master`, `mstplace`/`place`/`area`→address reference
   data (no direct table; fold into address columns), `stoneratemaster`/
   `beeds`→`tbl_gemstone_master`.
2. Parties: `usermaster`→`tbl_user_master`+`tbl_employee_details`,
   `customer`→`tbl_customer_master`, vendors (karigars/suppliers scattered
   across `binmast`/`worker*`/purchase supplier fields)→`tbl_vendor_master`,
   `bank`→`tbl_bank_account_master`.
3. Stock: `stock`→`tbl_ornament_master` (the big one — see below).
4. Transactions, oldest-first: `purchase`/`purchase_details`, `sale`/
   `sale_details`, `jobcard_details`/`karigar_transaction`, `pawnbrokin`,
   `scheme`/`beeds*`/`sas*`, `insurance`/`amc_det`, `attendance`.

## Module-by-module mapping

### Masters
| Legacy | New | Notes |
|---|---|---|
| `company` | (local: none — single row config; cloud: `tbl_tenant_master`) | Legacy stored one row per install; becomes the tenant row in the cloud DB, or a config row in local. |
| `branch` | `tbl_branch_master` | |
| `usermaster` | `tbl_user_master` + `tbl_employee_details` | Split: login/permission fields → `tbl_user_master`; HR fields (DOB, Aadhaar, bank a/c, salary basics) → `tbl_employee_details`. |
| `customer` | `tbl_customer_master` | `karat_klub`/`class`/`Ftype` (customer tier) have no direct column — fold into `Notes` or a future `Customer_Tier` column if needed. |
| `itemtype` | `tbl_item_type_master` | |
| `design` | `tbl_design_master` | |
| `metaltype`, `purity` | `tbl_purity_master` | |
| `category`, `categorymaster` | `tbl_sub_category_master` | |
| `brand` | `tbl_brand_master` | |
| `beeds` (stone master), `stoneratemaster` | `tbl_gemstone_master` | Confusingly, legacy `beeds` means "stone/setting", not the gold-savings scheme — don't confuse with `tbl_saving_scheme_*`. |
| `bank`, `bank_master` | `tbl_bank_account_master` | |
| `hsn_mast` | `tbl_hsn_master` | |

### Stock / Inventory
| Legacy | New | Notes |
|---|---|---|
| `stock` | `tbl_ornament_master` | The single widest legacy table (140+ columns) maps to the single widest new table. Field-for-field: `tagno`→`Article_Number`, `gross`→`Gross_Weight`, `netwt`→`Net_Gold_Weight`, `beeds`→`Stone_Weight`, `wastage`→`Wastage_Weight`, `mcpg`/`makingcharge`→`Base_Making_Charge_Per_Gram`/`Final_Making_Charge_Total`, `huid`/`huid2`/`huid3`/`huid4`→four rows in `tbl_huid_master` (new schema normalizes multi-HUID into its own table instead of 4 fixed columns). |
| `binmast`, `bindata`, `bin`, `bin_details` | `tbl_tray_master` / `tbl_bin_*` (existing) | Legacy bin-of-loose-stones concept ≈ existing `tbl_bin_purchase`/`tbl_bin_orders` bin-level module — reconcile granularity case-by-case at import time, don't assume 1:1. |
| `stockpacket`, `packethistory` | `tbl_stock_transfer` + `tbl_stock_transfer_items` | |
| `barcode` | (`tbl_ornament_master.QR_Code_Data` / `RFID_Tag`) | |

### Sales / Purchase
| Legacy | New | Notes |
|---|---|---|
| `sale` | `tbl_sales_header` | `billno`→`Invoice_Number` (+ new surrogate `Sale_ID`), `customer`→`Customer_ID`, `grandtotal`→`Net_Payable_Amount`, `cash_recd`/`chq_recd`/`card_recd`→rows in `tbl_sales_payments`, not columns. |
| `sale_details` | `tbl_sales_details` | `stock`→`Ornament_ID` (remap via `tagno`→`Article_Number`→new `Ornament_ID`). |
| `salesreturn`, `salesreturn_detail` | `tbl_bin_sales_return` or a dedicated return against `tbl_sales_header` (decide per-flow at import time) | |
| `purchase`, `purchase_details` | `tbl_purchase_header`, `tbl_purchase_details` | |
| `customerorder_main/detail`, `order_creation*` | `tbl_custom_order` | |
| `repair`, `repairs`, `repaircategory` | `tbl_repair_orders` | |

### Karigar / Manufacturing
| Legacy | New | Notes |
|---|---|---|
| `jobcard_details`, `jobcardhistory` | `tbl_issue_to_karigar` + `tbl_return_from_karigar` | Legacy single wide job-card row splits into issue and return events. |
| `karigar_transaction` | `tbl_pawn_loan_transactions`-style ledger doesn't apply — map to accounting: `tbl_accounting_journal`/`tbl_accounting_entries` against the karigar's vendor ledger. |

### Schemes / Savings
| Legacy | New | Notes |
|---|---|---|
| `scheme`, `scheme_details` | `tbl_saving_scheme_master`, `tbl_scheme_master`/`tbl_scheme_groups` | The new schema's savings-scheme module is already far more developed than legacy — treat legacy scheme data as a data *source* feeding the richer new structure, not a 1:1 column copy. |
| `sas`, `sas_detail`, `subsas` | `tbl_scheme_members` / `tbl_scheme_transactions` | |
| `denomination_collection*` | `tbl_scheme_transactions` (`Payment_Mode`/`Amount`) | |

### Pawnbroking, Insurance/AMC — new modules added this round
| Legacy | New |
|---|---|
| `pawnbrokin`, `pawnbrokin_interest` | `tbl_pawn_loan_header`, `tbl_pawn_loan_items`, `tbl_pawn_loan_transactions` |
| `bank_pledge`, `bank_pledge_logs` | `tbl_pawn_loan_transactions` (Txn_Type = relevant pledge event) or `tbl_cheque_register` if it was a bank-instrument event |
| `insurance`, `insurance_policy`, `insuranceregister` | `tbl_insurance_policy_master`, `tbl_customer_insurance` |
| `amc_cust`, `amc_det` | `tbl_amc_plan_master`, `tbl_amc_enrollment` |

### HR / CRM — new modules added this round
| Legacy | New |
|---|---|
| `attendance`, `attendance_history`, `holiday` | `tbl_attendance`, `tbl_holiday_master` |
| `staff_sal_det` | `tbl_salary_structure`, `tbl_payroll_run`/`tbl_payroll_details` |
| `salesman_incentive*`, `incent_slab`, `itemincentive_det1/2` | `tbl_incentive_slab_master`, `tbl_sales_incentive_transactions` |
| `crm_lead_entry`, `crm_master`, `crm_enquiry` | `tbl_crm_lead` |
| `custfollowups`, `genfollowup*` | `tbl_crm_followup` |
| `cust_feedback` | `tbl_customer_feedback` |
| `agent_comission` | `tbl_agent_commission_transactions` (+ `tbl_agent_master` for the agent record itself) |
| `ratecut_entry`, `ratecut_main`, `ratecuting` | `tbl_rate_booking` |
| `loyaltypoints`, `loyaltypconv` | `tbl_loyalty_points_slab` |
| `einvoice_billdetails`, `einvoice_logs` | `tbl_einvoice_log` |
| `chq_clear` | `tbl_cheque_register` |

### Manufacturing Efficiency / BOM / Melting-Refining — new module, second pass
| Legacy | New |
|---|---|
| `mfg_category`, `mfg_eff_worktype`, `prod_dept` | `tbl_production_department_master` |
| `billofmaterial`, `billofmaterial_main`, `mfg_eff_deptbom`, `mfg_eff_settingbom`(+`_bac`) | `tbl_bom_master` + `tbl_bom_department_stages` — the `_bac` table was a manual backup copy, not a distinct concept; not ported. |
| `mfg_eff_conduct`, `prod_transaction`, `mfg_eff_salary`, `mfg_eff_setting` | `tbl_production_transaction` |
| `mfg_melting`, `mfg_refining`, `mcwastage`, `wk_mcwstg` | `tbl_melting_refining_log` |
| `mfg_rub_bom`, `mfg_rub_stock`, `mfg_binset` | `tbl_mould_bom_stock` |

### Guarantor, certification, reorder, RFID, card charges, Tally, permissions — new modules, second pass
| Legacy | New |
|---|---|
| `guarantor` | `tbl_pawn_loan_guarantor` |
| `certificate`, `certificate_details`, `certificate_mast` | `tbl_gem_certificate` — do not confuse with `tbl_huid_master` (hallmark/BIS purity certification, a different regulatory scheme). |
| `reorder` | `tbl_reorder_request` |
| `rfid_collection` | `tbl_rfid_scan_log` |
| `card_charges`, `card_master`, `dup_card_details` | `tbl_card_charges_master` |
| `tally_import`, `tally_log`, `tally_stkgroup`, `tally_stkitem`, `tally_unit` | `tbl_tally_config` (ledger/stock-group/unit mapping lives in its `Mapping_JSON` column instead of three separate master tables) + `tbl_tally_sync_log` |
| `sec_permissions`, `sec_userpermission`, `sec_userroles` | `tbl_user_permission_override` |
| `sec_userbin` | `tbl_user_bin_access` |
| `sec_modulelist` | *(no new table — already covered by the existing `tbl_erp_modules` registry)* |

### Still unresolved — needs your input, not yet built
- `member`, `members`, `member_ledger`, `member_ledger_del` — unclear whether
  this was a loyalty-club concept distinct from `tbl_scheme_members`, or an
  older/duplicate version of the same thing. **Don't assume — confirm with
  the business before the real import** which legacy table (`member` or
  `scheme_members`-equivalent) actually held the live data.

## Explicitly NOT carried forward
These legacy tables are dropped on import — they're either engine/tooling
artifacts with no business data, or one-off scratch tables from the old
desktop app's internals:
- `pbcatcol`, `pbcatedt`, `pbcatfmt`, `pbcattbl`, `pbcatvld` — PowerBuilder
  catalog/metadata tables, not application data.
- `dummy`, `test`, `temptab`, `tmp_col_acc`, `tmp_col_vnum`, `week1`, `week2`
  — scratch/working tables used by old reports or batch jobs.
- `sql_queries`, `log_table`, `mysessioncounter`, `sessioncounter`,
  `transcounter`, `rptsession`, `rptheader`, `master_delete`, `generate`,
  `findprod`, `finprod`, `lookup`, `info`, `error`, `app_db_error_log` —
  session/counter/report-scaffolding internals of the old FoxPro/PowerBuilder
  desktop client, meaningless outside that application.
- `sample_line`, `receptrar`, `recptarchana`, `ml_njm`, `dljcust`,
  `drawnumbers`, `va_master`, `vamc_auto` — no discernible business meaning
  from schema alone; **flag these for the business owner to review row
  counts on before deciding whether to carry any of them forward.**

## Open decisions before writing the actual ETL script
1. Which legacy `branch` rows are still active, to build the `Tenant_ID` /
   `Branch_ID` backfill map.
2. Whether `Data_Mode` should default to `3` (Official) for every imported
   row, or whether the business's legacy system tracked a kachha/pucca split
   somewhere that should be preserved.
3. How to handle legacy rows referencing an already-deleted parent (e.g. a
   `sale_details.stock` pointing at a `stock.tagno` that no longer exists) —
   recommend a pre-import orphan-row report before the real load.
