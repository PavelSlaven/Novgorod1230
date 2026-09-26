// Rebuilds books.csv -- bibliographic lookup for the book:<id> citations used across all
// economy-trade-measures CSVs. Source: the book-evidence pipeline's per-row authors/title/year
// (economy-trade-measures.csv, verified+fixed independently on the remote machine 2026-09-26),
// restricted to the book_ids actually cited by this collector's output tables.
//
// Run: node build_books.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toCSV } from "../scripts/lib_csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "books.csv");

const rows = [
  { book_id: 177850, authors: "Янин Валентин Лаврентьевич", title: "Денежно-весовые системы домонгольской Руси и очерки истории денежной системы средневекового Новгорода", year: 2009, book_type: "scholarly", note: "основной источник по денежно-весовой системе; verified via book-evidence pipeline 2026-09-26" },
  { book_id: 233420, authors: "Спасский Иван Георгиевич", title: "Русская монетная система", year: 1962, book_type: "scholarly", note: "" },
  { book_id: 254935, authors: "Янин Валентин Лаврентьевич", title: "Берестяная почта столетий", year: 1979, book_type: "scholarly", note: "" },
  { book_id: 301539, authors: "Погодин Михаил Петрович", title: "Древняя русская история до монгольского ига. Том 2", year: 1999, book_type: "scholarly", note: "труд XIX в. (переиздание 1999); устаревшие интерпретации возможны, использовать факты из первоисточников (летопись/договоры) в его изложении с оговоркой" },
  { book_id: 356156, authors: "Леонтьева Галина Александровна; Кобрин Владимир Борисович; Шорин Павел Александрович", title: "Вспомогательные исторические дисциплины", year: 2009, book_type: "scholarly", note: "" },
  { book_id: 392896, authors: "Рыбина Елена Александровна", title: "Новгород и Ганза", year: 2009, book_type: "scholarly", note: "в основном ганзейская пора (XIV-XV вв.), большинство фактов помечены medieval_general" },
  { book_id: 393995, authors: "Богданов Андрей Петрович", title: "Александр Невский. Друг Орды и враг Запада", year: 2014, book_type: "scholarly", note: "" },
  { book_id: 556930, authors: "Карпов Алексей Юрьевич", title: "Великий князь Александр Невский", year: 2010, book_type: "scholarly", note: "" },
  { book_id: 618717, authors: "Майоров Александр Вячеславович", title: "Русь, Византия и Западная Европа: Из истории внешнеполитических и культурных связей XII-XIII вв.", year: 2011, book_type: "scholarly", note: "" },
  { book_id: 622242, authors: "Рыбаков Борис Александрович и др.", title: "Древняя Русь. Город, замок, село", year: 1985, book_type: "scholarly", note: "" },
  { book_id: 624953, authors: "Янин Валентин Лаврентьевич и др.", title: "Древняя Русь. Быт и культура", year: 1997, book_type: "scholarly", note: "" },
  { book_id: 641351, authors: "Коллектив авторов (БЛДР)", title: "Библиотека литературы Древней Руси. Том 4 (XII век)", year: 2004, book_type: "primary_source", note: "содержит перевод Правды Русской и берестяных грамот; цены Правды -- штрафные/компенсационные оценки, не рыночные" },
  { book_id: 709382, authors: "Засурцев Петр Иванович", title: "Новгород, открытый археологами", year: "", book_type: "scholarly", note: "" },
  { book_id: 180605, authors: "Долгов Вадим Викторович", title: "Быт и нравы Древней Руси", year: 2007, book_type: "scholarly", note: "" },
  { book_id: 220870, authors: "Янин Валентин Лаврентьевич", title: "Новгород - раскрытая книга русского средневековья", year: 2000, book_type: "scholarly", note: "" },
  { book_id: 841960, authors: "Корогодина Мария Владимировна", title: "Правила Константинопольского синода 1276 года", year: 2025, book_type: "scholarly", note: "правила синода 1276 г.; вино как привозной товар применимо и к 1230 г." },
];

writeFileSync(OUT, toCSV(["book_id", "authors", "title", "year", "book_type", "note"], rows), "utf8");
console.log(`books.csv: ${rows.length} rows`);
