# アドオン：自作ウィジェットの作り方

personal-dashboard には、自分で作ったウィジェットを **アドオン** として追加できます。
アドオンは `public/addons/` に置く JavaScript のファイルで、本体（`app.js` や `index.html`）は書き換えません。
そのため、本家の更新を取り込むときも衝突しにくくなっています。

使い方は [USAGE.md](USAGE.md)、見た目の変え方は [DESIGN.md](DESIGN.md)、セットアップは [README.md](README.md) を見てください。

---

## まず試す：見本のアドオンを有効にする

見本として、指定した日までの残り日数を表示する **カウントダウン**（`public/addons/countdown.js`）が入っています。

1. `public/addons/index.js` を開き、次の行の先頭の `//` を消します。

   ```js
   import "./countdown.js";
   ```

2. コミットして GitHub Pages に公開されたら（ローカルなら再読み込みすれば）、
   **編集** → **＋ ウィジェットを追加** の「種類」に **カウントダウン** が出てきます。

使うアドオンは、このように `public/addons/index.js` に 1 行ずつ `import` で書きます。
本家はこのファイルを今後も空のまま保つので、自分で書き足しても本家の更新と衝突しません。

---

## しくみ

```
public/addons/index.js        … 使うアドオンを import するだけのファイル
  └ public/addons/○○.js      … アドオン本体。registerWidget({...}) で種類を 1 つ登録する
        ↓ 起動時に読み込む
public/js/app.js              … 登録された種類を、組み込みのウィジェットと同じように扱う
```

- 本体は起動するときに `public/addons/index.js` を読み込み、そこで登録された種類を組み込みます。
- ウィジェットの外枠（見出し・✎ ボタン・並べ替えのつまみ・大きさを変える角）や、編集画面の共通の項目（見出し・幅・高さ・色・タブ）は本体が用意します。
  **アドオンが作るのは、中身（本文）と、編集画面の種類ごとの設定欄だけ**です。
- 値を変えると自動で保存されます（ほかのウィジェットと同じく Firestore に保存されます）。

---

## アドオンを作る

`public/addons/` に新しいファイル（例：`hello.js`）を作り、`registerWidget()` を 1 回呼びます。

```js
import { registerWidget } from "../js/addon-api.js";

registerWidget({
  type: "hello",                 // 種類の名前（英小文字・数字・ハイフン）。保存データの "type" になる
  name: "あいさつ",               // 編集画面の「種類」に出る名前

  fields: [                      // 編集画面の設定欄（なくてもよい）
    { name: "who", label: "名前", placeholder: "世界" },
  ],

  render(widget, api) {          // 中身を作って返す
    return api.h("p", {}, `こんにちは、${widget.who || "世界"}！`);
  },
});
```

最後に `public/addons/index.js` に `import "./hello.js";` を足せば使えます。

### registerWidget に渡すもの

| 項目 | 必須 | 意味 |
|---|---|---|
| `type` | ○ | 種類の名前。英小文字で始まり、英小文字・数字・ハイフンで 2〜31 文字。組み込みの種類（`links`・`note` など）とは別の名前にする。**一度使い始めたら変えない**（保存データとの対応が切れます） |
| `name` | ○ | 編集画面の「種類」に出す名前 |
| `render(widget, api)` | ○ | 中身を作って返す関数（後述） |
| `fields` | | 編集画面の設定欄の一覧（後述） |
| `defaultRows` | | 新しく追加したときの高さ（1〜4 段）。省略すると 2 段 |
| `minSize` | | これより小さくできない大きさ。例：`{ size: "m", rows: 2 }`（`size` は `s` / `m` / `l` / `xl`） |
| `fixedRows` | | 高さを固定する段数（編集画面でもドラッグでも変えられなくなる） |
| `init(widget)` | | 新しく追加したとき、設定欄以外の初期値を入れる |
| `normalize(widget)` | | 保存データを読み込むたびに呼ばれる。設定欄以外の値の補正に使う |
| `css` | | このウィジェット用の CSS（文字列）。そのまま読み込まれる |

1 段（タイル 1 つ分）の高さは約 150px で、見出しを除くと中身に使えるのは約 85px です（コンパクト表示ではもう少し狭くなります）。

### 設定欄（fields）

`fields` に書いた欄が、そのウィジェットの編集画面に出ます。入力した値は `widget.名前` に保存されます。

```js
fields: [
  { name: "date",  label: "日付", type: "date" },
  { name: "count", label: "表示する件数", type: "number", min: 1, max: 20, default: 5 },
  { name: "mode",  label: "表示の形", type: "select", default: "list",
    options: [{ value: "list", label: "一覧" }, { value: "grid", label: "タイル" }] },
  { name: "big",   label: "文字を大きくする", type: "checkbox" },
  { name: "note",  label: "メモ", type: "textarea", hint: "Markdown は使えません" },
],
```

| 項目 | 意味 |
|---|---|
| `name` | 保存するときの名前（英字で始まる英数字）。`widget.date` のように読める。`id`・`type`・`title`・`size`・`rows`・`accent` は使わない |
| `label` | 欄の見出し |
| `type` | `text`（省略時）/ `textarea` / `number` / `url` / `date` / `time` / `color` / `select` / `checkbox` |
| `default` | 新しく追加したときの値 |
| `placeholder` | 空のときに薄く出す例 |
| `hint` | 欄の下に出す説明 |
| `min` / `max` / `step` | `number` の範囲（範囲外は保存できず、読み込むときも範囲内に直す） |
| `options` | `select` の選択肢。`{ value, label }` か、文字列の配列 |
| `rows` | `textarea` の行数 |

値は欄の種類に合わせて自動でそろえます（`number` は数、`checkbox` は `true` / `false`、`select` は選択肢のどれか、それ以外は文字列）。
入力欄で Enter を押すと保存されます（`textarea` では改行）。

### 中身を作る（render）

`render(widget, api)` は、ウィジェットの本文に入れる **要素を 1 つ返す**関数です（何も出さないなら `null`）。
値が変わるたびに呼び直されるので、そのときの `widget` の値から毎回作り直してください。

要素は `api.h(タグ名, 属性, ...中身)` で作ります。

```js
api.h("a", { class: "link", href: url, target: "_blank", rel: "noopener noreferrer" }, "表示する文字")
api.h("button", { type: "button", onclick: () => { /* 押したとき */ } }, "ボタン")
api.h("div", { class: "box", dataset: { id: "x" }, style: { color: "red" } }, 子要素1, 子要素2)
```

文字列の中身は**文字として**入るので、`<script>` などを書かれても実行されません。
外から来た文字列を `innerHTML` に入れるのはやめてください。

`render` の中でエラーが起きても、そのウィジェットにエラーの内容が出るだけで、ほかのウィジェットはそのまま動きます。

### api で使えるもの

| 名前 | 内容 |
|---|---|
| `h(タグ, 属性, ...中身)` | 要素を作る |
| `save()` | `widget` の値を変えたあとに呼ぶ。描き直して、少し後に保存する |
| `saveQuietly()` | 描き直さずに保存だけする（入力中の欄を描き直したくないとき） |
| `refresh()` | このウィジェットの中身だけを描き直す（保存はしない） |
| `every(ミリ秒, 関数)` | 一定時間ごとに関数を呼ぶ（時計のように表示を更新したいとき）。描き直されたりウィジェットが消えたりすると自動で止まる |
| `remote({ load, view, cacheKey, refreshMs })` | 外から読み込んで表示する（後述） |
| `openUrl(url)` | ⚙ の「リンクを新しいタブで開く」に合わせて URL を開く。危ない URL は開かない |
| `safeUrl(url)` | `http:` / `https:` などの安全な URL ならそのまま、`javascript:` などなら `null` を返す |
| `toast("メッセージ")` | 画面の下に短いお知らせを出す |
| `uid()` | 新しい id を作る（ウィジェットの中にリストを持つときなど） |
| `$(セレクター, 親)` / `$$(セレクター, 親)` | 要素を 1 つ / すべて探す |
| `settings` | 設定（テーマ・密度・リンクを新しいタブで開くか など）。読むだけにする |
| `language` / `locale` | 今の言語（`"ja"` / `"en"` …）と、日付・時刻の表示に使うロケール（`"ja-JP"` / `"en-US"` …） |
| `t(キー, 値)` / `localized(値)` | 本体の文言を取り出す / `{ ja, en }` から今の言語のものを選ぶ（下の「言語に対応する」） |
| `editing` | 編集モード中なら `true` |

**値を変えて保存する例**（押すたびに数が増えるボタン）：

```js
render(widget, api) {
  return api.h("button", {
    type: "button",
    class: "button",
    onclick: () => { widget.count = (widget.count || 0) + 1; api.save(); },
  }, `押した回数：${widget.count || 0}`);
},
```

**表示を 1 秒ごとに変える例**（経過時間）：

```js
render(widget, api) {
  const span = api.h("span", {}, "");
  const start = Date.now();
  const update = () => { span.textContent = `${Math.floor((Date.now() - start) / 1000)} 秒`; };
  update();
  api.every(1000, update);
  return span;
},
```

### 外から読み込んで表示する（remote）

天気や GitHub のウィジェットと同じく、読み込み中の表示・エラー表示・↻ ボタン・一定時間ごとの読み込み直しが付きます。

```js
render(widget, api) {
  return api.remote({
    cacheKey: widget.city,                 // これが変わったら読み込み直す
    refreshMs: 30 * 60 * 1000,             // 読み込み直す間隔（最短 1 分）
    load: async () => {                    // データを読み込んで返す（Promise）
      const res = await fetch(`https://example.com/api?city=${encodeURIComponent(widget.city)}`);
      if (!res.ok) throw new Error("読み込めませんでした");
      return res.json();
    },
    view: (data) => api.h("p", {}, data.text), // 読み込んだデータを表示する
  });
},
```

- ブラウザから直接呼ぶので、そのサービスが **CORS** に対応している（ブラウザからの呼び出しを許している）必要があります。
- `load` でエラーを投げると、そのメッセージがウィジェットに表示されます。
- 読み込んだデータは表示に使うだけで、保存データには入りません。

### 見た目（css）

ウィジェットの外枠には `widget--種類名` のクラスが付きます（例：`.widget--countdown`）。
`css` に書いた CSS は、テーマや `custom.css` で上書きできる順番（`components` レイヤー）で読み込まれます。
色や余白は、テーマに合わせて変わるよう CSS 変数（[DESIGN.md](DESIGN.md) の「主な CSS 変数」）を使ってください。

```js
css: `
  .countdown__days { font-size: var(--font-size-clock); color: var(--widget-accent); }
  .countdown__label { color: var(--color-text-muted); font-size: var(--font-size-sm); }
`,
```

本体と同じ部品のクラスも使えます：`button`・`button--primary`・`button--small`・`input`・`widget__empty`（「まだ設定されていません」などの説明文）。

### 言語に対応する

画面は日本語と英語に対応しています（⚙ の「言語」）。アドオンも、名前や設定欄を言語ごとに書けます。
文字列を書くところに `{ ja: "…", en: "…" }` を渡すと、今の言語のものが表示されます（ない言語は英語、英語もなければ日本語）。

```js
registerWidget({
  type: "countdown",
  name: { ja: "カウントダウン", en: "Countdown" },
  fields: [
    { name: "date", label: { ja: "日付", en: "Date" }, type: "date" },
    { name: "label", label: { ja: "何の日か", en: "What day" }, placeholder: { ja: "年末", en: "New Year" } },
  ],
  render(widget, { h, language, localized }) {
    const days = 10;
    return h("p", {}, localized({ ja: `あと ${days} 日`, en: `${days} days to go` }));
  },
});
```

- 言語ごとに書けるのは `name`、設定欄の `label`・`placeholder`・`hint`、`select` の選択肢の `label` です。
- `render` の中の文は、`api.language`（`"ja"` / `"en"`）で分けるか、`api.localized({ ja, en })` を使います。
- 日付や時刻は `date.toLocaleDateString(api.locale)` のように、`api.locale` を渡すと言語に合います。
- 言語を変えると、ウィジェットは描き直されます。

---

## 保存されるデータ

アドオンのウィジェットも、ほかのウィジェットと同じ形の JSON で保存されます。

```json
{
  "id": "a1b2c3d4",
  "type": "countdown",
  "title": "締め切りまで",
  "size": "s",
  "rows": 1,
  "date": "2026-12-31",
  "label": "年末"
}
```

- `id`・`type`・`title`・`size`・`rows`・`accent` は本体が扱います。それ以外は、設定欄の値や、`render` の中で `widget` に足した値です。
- ダッシュボード全体で **500KB まで**（Firestore のルール）なので、大きなデータや画像そのものは入れないでください。
- **パスワードや API キーなどの秘密は入れないでください。** リポジトリを Public にしている場合、アドオンのファイルも誰でも見られるので、ファイルにも書かないでください。
- アドオンを `index.js` から外しても、そのウィジェットのデータは消えません。
  画面には「アドオンが見つかりません」と出て、大きさの変更や削除はできます。アドオンを戻すと元どおり表示されます。

---

## 試すときのポイント

- ブラウザの開発者ツールの Console に、赤いエラーが出ていないか見てください。
  アドオンのファイルが読み込めないとき（ファイル名の間違い・文法の誤りなど）は、画面の上にお知らせが出ます。
- ⚙ のテーマや「コンパクト」、スマートフォンの幅でも崩れないか見ておくと安心です。
- ブラウザがファイルを覚えていて、書き換えが反映されないことがあります。そのときは強制再読み込み（Windows は Ctrl＋Shift＋R、Mac は Command＋Shift＋R）をしてください。

みんなに使ってもらえそうなアドオンができたら、本家の [Issues](https://github.com/kwaka1208/personal-dashboard/issues) で教えてください。

---

## 参考：本体のウィジェットの仕組み

組み込みのウィジェットは `public/js/app.js` にあります。アドオンもこれと同じ流れに乗っています。

```
保存データ（JSON）
  │  読み込み：normalize() → normalizeWidget()   … 足りない値を補い、おかしな値を直す
  ▼
state（画面の状態。1 つの JSON）
  │  描画：render() → renderWidget() → renderWidgetBody()   … 種類ごとの描画関数を呼ぶ
  ▼
画面
  │  操作：state を書き換えて commit()
  ▼
保存：scheduleSave() → 0.8 秒後に storage.save()   … Firestore（とブラウザの控え）へ
```

| ファイル | 役割 |
|---|---|
| `public/js/app.js` | 画面のほとんど。組み込みのウィジェット、アドオンの組み込み（末尾の「アドオン」） |
| `public/js/addon-api.js` | アドオンが使う `registerWidget()` |
| `public/addons/index.js` | 使うアドオンの一覧（本家では空） |
| `public/index.html` | 編集画面。アドオンの設定欄は `#addon-fields` に自動で入る |
| `public/css/components.css` | 組み込みのウィジェットの見た目 |
