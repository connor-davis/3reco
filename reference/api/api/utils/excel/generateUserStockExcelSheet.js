let fs = require('fs');
let path = require('path');
let ExcelJS = require('exceljs');
let moment = require('moment');
const { v4 } = require("uuid");

const generateUserStockExcelSheet = async (stock, callback) => {
  try {
    let workbook = new ExcelJS.Workbook();

    workbook.creator = '3rEco';
    workbook.lastModifiedBy = '3rEco Server';
    workbook.created = new Date();
    workbook.modified = new Date();

    let stockSheet = workbook.addWorksheet('Stock', {
      headerFooter: { firstHeader: 'Stock Name' },
    });

    stockSheet.columns = [
      { header: 'Stock Name', key: 'stockName' },
      { header: 'Stock Description', key: 'stockDescription' },
      { header: 'Stock Type', key: 'stockType' },
      { header: 'Stock Weight', key: 'stockWeight' },
      { header: 'Stock Value', key: 'stockValue' },
    ];

    stock.forEach((item) => {
      stockSheet.addRow({
        stockName: item.stockName || 'Unspecified',
        stockDescription: item.stockDescription || 'Unspecified',
        stockType: item.stockType || 'Unspecified',
        stockWeight: item.stockWeight + ' kg' || 'Unspecified',
        stockValue: 'R ' + item.stockValue || 'Unspecified',
      });
    });

    stockSheet.columns.forEach((column) => {
      const lengths = column.values.map((v) => v.toString().length);
      column.width = Math.max(...lengths.filter((v) => typeof v === 'number'));
    });

    const id = v4()

    workbook.xlsx
      .writeFile(path.join(process.cwd(), 'temp', id + 'stock.xlsx'))
      .then(() => {
        callback(path.join(process.cwd(), 'temp', id + 'stock.xlsx'), 'stock.xlsx');
      });
  } catch (error) {
    console.log(error);
  }
};

module.exports = generateUserStockExcelSheet;
