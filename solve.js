// Fast drop-in for make.fun's csv-reader 1.0.0: returns exactly csv-reader's answer
// {columns, rows, errors} for every {text, header}, much faster.
//
// Strategy: most records are plain lines (no quotes, no stray CRs). Those are taken
// whole: one slice, one split(','). Anything else falls back to a field parser that
// jumps with indexOf/regex instead of reading one character at a time. Every branch
// below mirrors the reference's policy, including error order and line counting:
//  - U+FEFF at the very start is dropped
//  - a record ends at LF or CRLF; a line left with no characters is no record
//  - outside quotes a CR not followed by LF is dropped (stray_cr)
//  - a field opening with a quote runs to the next quote that is not doubled,
//    "" inside it is one quote, CRLF or a lone CR inside it reads as LF; what
//    follows its closing quote, up to the next comma or line break, is appended
//    as it stands (quote_junk, when the field ends); a quote that never closes
//    is a literal character and the text after it is read again as unquoted
//    (unterminated_quote); a quote inside an unquoted field is a literal
//  - fields stay strings, never trimmed or converted
//  - columns is the first record when header is true, else null; rows are the
//    records after it, each padded (short_row, with fields: its count) or cut
//    (long_row, with extra: the cut fields) to the first record's width
//  - each error is {code, line, row}, in the order met; line is the 1-based line
//    its record starts on, row its record's index in rows (null for the header)

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows (null: header).
  let recordLine = 1;
  let recordRow = null;

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Next delimiter (, LF or CR) at or after i, via one bounded regex scan.
  const DELIM = /[,\r\n]/g;

  // Reads unquoted characters onto `init` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). `added` counts characters kept.
  function unquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        const seg = text.slice(pos);
        value += seg;
        added += seg.length;
        pos = n;
        return { value, ended: END, added };
      }
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === '\n') {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // CR: CRLF ends the record, a lone CR is dropped (stray_cr).
      if (text.charCodeAt(i + 1) === 10) {
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      value += text.slice(pos, i);
      added += i - pos;
      err('stray_cr');
      pos = i + 1;
    }
  }

  // Appends text[a..b) with every CR or LF read as LF, counting the lines.
  function appendQuoted(value, a, b) {
    let cur = a;
    for (;;) {
      const ri = text.indexOf('\r', cur);
      const ni = text.indexOf('\n', cur);
      let m = -1;
      if (ri !== -1 && ri < b && (ni === -1 || ni >= b || ri < ni)) m = ri;
      else if (ni !== -1 && ni < b) m = ni;
      if (m === -1) return value + text.slice(cur, b);
      value += text.slice(cur, m);
      value += '\n';
      line += 1;
      cur = text.charCodeAt(m) === 13 && text.charCodeAt(m + 1) === 10 ? m + 2 : m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function quoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let segStart = pos;
    let closed = false;
    let q;
    while ((q = text.indexOf('"', pos)) !== -1) {
      if (text.charCodeAt(q + 1) === 34) {
        value = appendQuoted(value, segStart, q);
        value += '"';
        pos = q + 2;
        segStart = pos;
        continue;
      }
      value = appendQuoted(value, segStart, q);
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      err('unterminated_quote');
      return unquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = unquoted(value);
    if (junk.added > 0) err('quote_junk');
    return junk;
  }

  // Finishes a record: no record for one empty unquoted field, else width/header
  // handling and the short_row / long_row error when the record ends.
  function finish(fields, lastQuoted) {
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record is one plain line (no quote, no stray CR in it).
    const e = text.indexOf('\n', pos);
    const segEnd = e === -1 ? n : e;
    let contentEnd = segEnd;
    if (e !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) contentEnd = segEnd - 1;
    if (contentEnd > pos) {
      const seg = text.slice(pos, contentEnd);
      if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
        const fields = seg.split(',');
        if (e === -1) pos = n;
        else {
          pos = e + 1;
          line += 1;
        }
        finish(fields, false);
        continue;
      }
    }

    // General path: field by field.
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const f = quoted();
        fields.push(f.value);
        ended = f.ended;
      } else {
        lastQuoted = false;
        const f = unquoted('');
        fields.push(f.value);
        ended = f.ended;
      }
    } while (ended === COMMA);
    finish(fields, lastQuoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
