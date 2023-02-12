let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');
const { v4 } = require("uuid");

const generateUserTransactionsExcelSheet = async (transactions, callback) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = '3rEco';
    workbook.lastModifiedBy = '3rEco Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let transactionsSheet = workbook.addWorksheet('Transactions', {
      headerFooter: { firstHeader: 'Buyer' },
    });

    transactionsSheet.columns = [
      { header: 'Date', key: 'date' },
      { header: 'Buyer', key: 'buyer' },
      { header: 'Buyer Phone Number', key: 'buyerPhoneNumber' },
      { header: 'Seller', key: 'seller' },
      { header: 'Seller Phone Number', key: 'sellerPhoneNumber' },
      { header: 'Stock Type', key: 'stockType' },
      { header: 'Weight', key: 'weight' },
      { header: 'Value', key: 'value' },
    ];

    transactions.forEach((transaction) => {
      transactionsSheet.addRow({
        date: moment(transaction.date).format("DD/MM/YY HH:MM A") || 'Unspecified',
        buyer: transaction.buyer || 'Unspecified',
        buyerPhoneNumber: transaction.buyerPhoneNumber || 'Unspecified',
        seller: transaction.seller || 'Unspecified',
        sellerPhoneNumber: transaction.sellerPhoneNumber || 'Unspecified',
        stockType: transaction.stockType || 'Unspecified',
        weight: transaction.weight + ' kg' || 'Unspecified',
        value: 'R ' + transaction.value || 'Unspecified',
      });
    });

    transactionsSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    const id = v4()

    workbook.xlsx
      .writeFile(path.join(process.cwd(), 'temp', id + 'transactions.xlsx'))
      .then(() => {
        callback(path.join(process.cwd(), 'temp', id + 'transactions.xlsx'), 'transactions.xlsx');
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = generateUserTransactionsExcelSheet;
