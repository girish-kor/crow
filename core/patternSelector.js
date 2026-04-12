'use strict';

const fs   = require('fs');
const path = require('path');
const { tokenize } = require('./intentParser');

/**
 * Lightweight TF-IDF + cosine-similarity ranker.
 * Deterministic and explainable — no ML framework required.
 */
class TFIDFRanker {
  constructor(corpus) {
    if (!Array.isArray(corpus) || corpus.length === 0) {
      throw new Error('Corpus must be a non-empty array');
    }
    this.corpus    = corpus;
    this.documents = corpus.map(e => tokenize(e.intent));
    this.vocab     = this._buildVocab();
    this.idf       = this._computeIDF();
    this.matrix    = this._computeMatrix();
  }

  _buildVocab() {
    const set = new Set();
    for (const doc of this.documents) for (const t of doc) set.add(t);
    return Array.from(set).sort();
  }

  _tf(doc) {
    const freq = {};
    for (const t of doc) freq[t] = (freq[t] || 0) + 1;
    const total = doc.length || 1;
    const out = {};
    for (const [t, c] of Object.entries(freq)) out[t] = c / total;
    return out;
  }

  _computeIDF() {
    const N = this.documents.length;
    const idf = {};
    for (const term of this.vocab) {
      const df = this.documents.reduce((acc, d) => acc + (d.includes(term) ? 1 : 0), 0);
      idf[term] = Math.log((N + 1) / (df + 1)) + 1; // smoothed
    }
    return idf;
  }

  _toVector(doc) {
    const tf  = this._tf(doc);
    const vec = {};
    for (const term of this.vocab) vec[term] = (tf[term] || 0) * (this.idf[term] || 0);
    return vec;
  }

  _computeMatrix() {
    return this.documents.map(d => this._toVector(d));
  }

  _cosine(v1, v2) {
    let dot = 0, n1 = 0, n2 = 0;
    for (const t of this.vocab) {
      const a = v1[t] || 0;
      const b = v2[t] || 0;
      dot += a * b; n1 += a * a; n2 += b * b;
    }
    if (n1 === 0 || n2 === 0) return 0;
    return dot / (Math.sqrt(n1) * Math.sqrt(n2));
  }

  /**
   * Rank corpus entries against a query string.
   * @param {string} queryStr
   * @param {number} topN
   * @returns {{ score: number, entry: object }[]}
   */
  rank(queryStr, topN = 5) {
    const queryVec = this._toVector(tokenize(queryStr));
    return this.matrix
      .map((docVec, i) => ({ score: this._cosine(queryVec, docVec), entry: this.corpus[i], index: i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}

// ── Singleton with lazy load ─────────────────────────────────────────────────
let _ranker = null;

function getRanker() {
  if (_ranker) return _ranker;
  const dsPath = path.join(__dirname, '../patterns/dataset.json');
  if (!fs.existsSync(dsPath)) {
    throw new Error('Dataset not found. Run: npm run seed');
  }
  const dataset = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
  _ranker = new TFIDFRanker(dataset);
  return _ranker;
}

/**
 * Select best-matching patterns for an intent string.
 */
function selectPattern(intentStr, topN = 5) {
  return getRanker().rank(intentStr, topN);
}

/** Reset the ranker (useful in tests). */
function resetRanker() { _ranker = null; }

module.exports = { selectPattern, resetRanker, TFIDFRanker };
