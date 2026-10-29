export async function extractResume(file) {
  if (file.size > 10 * 1024 * 1024 || !/\.(pdf|txt|md)$/i.test(file.name)) throw new Error('Choose a PDF, TXT, or Markdown resume smaller than 10 MB.');
  let text;
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('./vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', import.meta.url).href;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 30) throw new Error('Choose a resume with at most 30 pages.');
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        let line = '', previous;
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          if (previous && !previous.hasEOL && item.transform && previous.transform) {
            const gap = item.transform[4] - previous.transform[4] - previous.width;
            const fontSize = Math.abs(item.transform[0]) || 10;
            if (gap > fontSize * 0.15 && !/\s$/.test(line) && !/^\s/.test(item.str)) line += ' ';
          }
          line += item.str + (item.hasEOL ? '\n' : ''); previous = item;
        }
        pages.push(line);
      }
      text = pages.join('\n\n');
    } catch (error) {
      if (error.name === 'PasswordException') throw new Error('Remove the PDF password before uploading.');
      throw error;
    } finally { await task.destroy(); }
  } else text = await file.text();
  text = text.trim();
  if (!text) throw new Error('No readable text found. For a scanned PDF, use a text-based PDF or paste your resume text below.');
  if (text.length > 40000) throw new Error('Resume text must be under 40,000 characters.');
  return text;
}
