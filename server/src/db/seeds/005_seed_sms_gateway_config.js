/**
 * Seed 005 — SMS gateway global default config (Asterix Technology)
 * Tenant_ID = NULL rows are the fallback used when a tenant has no
 * gateway/template config of its own.
 */
exports.seed = async function (knex) {

  const existingConfig = await knex('tbl_sms_gateway_config')
    .where({ Tenant_ID: null, Provider: 'asterix' })
    .first();

  if (!existingConfig) {
    await knex('tbl_sms_gateway_config').insert({
      Tenant_ID: null,
      Provider: 'asterix',
      Api_Base_Url: 'http://sms.asterixtechnology.com/submitsms.jsp',
      Api_User: 'TRISHAANAJ',
      Api_Key: '8883ce025bXX',
      Sender_Id: 'TAJWLS',
      Entity_Id: '1101545190000083228',
      Account_Usage: '1',
      Is_Active: true,
    });
  }

  const existingTemplate = await knex('tbl_sms_templates')
    .where({ Tenant_ID: null, Purpose: 'OTP' })
    .first();

  if (!existingTemplate) {
    await knex('tbl_sms_templates').insert({
      Tenant_ID: null,
      Purpose: 'OTP',
      Dlt_Template_Id: '1107176156691281116',
      Template_Text: '<OTP> : OTP for user registration purpose only. From TRISHAAN ABHARAN JEWELLERY, Nelamangala,Bengaluru-Rural-562123',
      Is_Active: true,
    });
  }
};
