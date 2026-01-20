exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('orders', 'prepaymentUpdatedAt');
  if (!hasColumn) {
    await knex.schema.table('orders', (table) => {
      table.text('prepaymentUpdatedAt');
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('orders', 'prepaymentUpdatedAt');
  if (hasColumn) {
    await knex.schema.table('orders', (table) => {
      table.dropColumn('prepaymentUpdatedAt');
    });
  }
};
