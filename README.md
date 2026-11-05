# personal-dashboard

![personal-dashboard の画面（初期レイアウト）](docs/screenshot.png)

よく使うツールへのリンクやメモをまとめた、**自分専用のダッシュボード**です。
Google アカウントでログインした本人だけが、中身を見たり編集したりできます。

> **現在はベータ版（v1.0 beta）です。**
> 日常的に使える状態ですが、今後のアップデートで機能や画面、保存データの形式が変わることがあります。
> 大事なデータは ⚙ の **書き出す（JSON）** でときどきバックアップしておいてください。
> 不具合や気づいた点は [Issues](https://github.com/kwaka1208/personal-dashboard/issues) で教えてもらえると助かります。

- 画面のレイアウトはドラッグ＆ドロップで自由に並べ替え
- リンク集・ToDo・写真・Google カレンダー・Gmail・天気・タイマー（ポモドーロ）・世界時計・習慣トラッカー・GitHub・メモ（Markdown）・時計・Web 検索・埋め込み（YouTube など）の 14 種類のウィジェット
- ブラウザのアドレスバーから URL をドラッグ＆ドロップするだけでリンクを追加
- ウィジェットの大きさも、右下の角をドラッグしてマス目単位で変更
- 自分で作ったウィジェットを **アドオン** として追加できる（本体のファイルは書き換えない）
- 編集内容は Firebase（Cloud Firestore）に自動保存されるので、PC でもスマホでも同じ画面
- 見た目はテーマで切り替え、CSS 変数（デザイントークン）で丸ごと着せ替えも可能。ライト / ダークは右上のボタンか **D** キーでいつでも切り替え
- 画面は **日本語と英語** に対応（ブラウザの言語に合わせて自動で切り替え。設定で固定も可能）。言語は追加できます
- このリポジトリは**テンプレート**です。コピーして自分のリポジトリを作れば、誰でも自分用のダッシュボードを無料で持てます

## 使い方

操作方法とウィジェットごとの使い方は **[USAGE.md](USAGE.md)** にまとめています。

- 右上の **編集** で、ウィジェットやタブの追加・並べ替え・大きさの変更ができます。
- リンク集・ToDo・写真・Google カレンダー・Gmail・天気・タイマー・世界時計・習慣トラッカー・GitHub・メモ・時計・Web 検索・埋め込みの 14 種類のウィジェットがあります。
- カレンダー・Gmail を使うときはセットアップの手順 9、GitHub を使うときは個人用アクセストークンが必要です（詳しくは USAGE.md）。

---

## 見た目をカスタマイズする

色・フォント・カードの形・テーマなど、見た目の変え方は **[DESIGN.md](DESIGN.md)** にまとめています。

- いちばん簡単なのは、`public/css/custom.css` に CSS 変数（例：`--color-accent`）を書いて上書きする方法です。
- 設定画面で選べるテーマを増やす方法、部品ごとのクラス名の一覧、初回表示のレイアウト（`public/default-dashboard.json`）の変え方も DESIGN.md にあります。

---

## アドオン（自作ウィジェット）

自分で作ったウィジェットを **アドオン** として追加できます。`public/addons/` にファイルを置いて `public/addons/index.js` で読み込むだけで、本体のファイルは書き換えません。
作り方と見本（カウントダウン）は **[WIDGET.md](WIDGET.md)** にまとめています。

---

## 言語（多言語対応）

画面の言語は、日本語と英語が入っています。ふだんはブラウザの言語に合わせて自動で選ばれ、⚙ の **言語 / Language** で固定することもできます。

画面の文言は `public/js/locales/` に、言語ごとのファイルでまとめています（`ja.js`・`en.js`）。
`"キー": "文"` の形で並んでいて、`{name}` のような部分には表示するときに値が入ります。

**言語を増やす**（例：フランス語）

1. `public/js/locales/en.js` をコピーして `fr.js` を作り、右側の文をすべて翻訳します（左側のキーと `{…}` はそのまま）。
2. `public/js/i18n.js` に 2 行足します。

   ```js
   import fr from "./locales/fr.js";
   // …
   export const LANGUAGES = [
     // …
     { id: "fr", label: "Français", locale: "fr-FR" },
   ];
   const MESSAGES = { ja, en, fr };
   ```

訳し忘れたキーは英語で表示されます。
初期レイアウト（`public/default-dashboard.json`）の見出しは `{ "ja": "メモ", "en": "Notes" }` のように言語ごとに書けます（初めて開いたときの言語で保存されます）。

---

## バグ報告・要望・コメント

不具合の報告、機能の要望、感想などは、本家リポジトリの **[Issues](https://github.com/kwaka1208/personal-dashboard/issues/new/choose)** に書いてください。
**New issue** を押すと、書く内容に合わせて選べます。

| 選ぶもの | 使うとき |
|---|---|
| **バグ報告 / Bug report** | うまく動かない・表示がおかしい。何をしたらどうなったか、ブラウザと OS などを書く欄があります |
| **要望・アイデア / Feature request** | 新しいウィジェットや機能、改善のアイデア。「こんなことに困っている」だけでも大歓迎です |
| **Blank issue**（空の Issue） | 感想・質問など、上のどちらにも当てはまらないとき |

- Issue は誰でも見られます。Firebase の設定値、アクセストークン、ダッシュボードの中身など、人に見せたくない情報は書かないでください。

---

## しくみ

```
ブラウザ ──▶ GitHub Pages（画面：HTML / CSS / JavaScript）
   │
   ├──▶ Firebase Authentication（Google でログイン）
   └──▶ Cloud Firestore（ダッシュボードのデータ。本人だけ読み書きできる）
```

| 役割 | 使うもの | 費用 |
|---|---|---|
| ソースコードの管理と画面の公開 | GitHub ＋ GitHub Pages | 無料 |
| ログイン（Google 認証） | Firebase Authentication | 無料 |
| データの保存 | Cloud Firestore | 無料プラン（Spark）で足ります。カードの登録も不要 |

Firebase は**各自が自分のプロジェクトを作って**使います。あなたのデータはあなたの Firebase に保存され、
テンプレートの作者や他の利用者が見ることはできません。

### 何が公開されて、何が守られるか

| 誰でも見られるもの | ログインした本人しか見られないもの |
|---|---|
| ログイン画面と、画面のプログラム（このリポジトリと同じ内容） | 登録したリンク、メモ、ウィジェットの並び |
| `firebase-config.js` に書く Firebase の設定値 | ダッシュボードの名前、テーマ、埋め込みの URL |

データを守っているのは、Firestore の**セキュリティルール**（`firestore.rules`）です。
「ログインしていて、許可したメールアドレスで、自分のデータであること」を満たすときだけ読み書きできます。
他の人が Google アカウントでログインすること自体はできますが、データは一切読めません。

Firebase の設定値（`apiKey` など）は、画面のプログラムに埋め込んで公開する前提の値で、秘密情報ではありません。

---

## 自分用のダッシュボードを作る手順

所要時間は 15〜20 分ほどです。用意するのは GitHub アカウントと Google アカウントの 2 つです。

> Firebase と GitHub の管理画面は、ときどきメニュー名が変わります。見当たらないときは、
> 各手順に付けた公式ドキュメントのリンクを確認してください。

### 1. テンプレートから自分のリポジトリを作る

1. このリポジトリの右上にある **Use this template → Create a new repository** を押します。
2. Owner に自分のアカウント、Repository name に好きな名前（例：`personal-dashboard`）を入れます。
3. 公開範囲は **Public** を選びます。
   GitHub の無料プランでは、GitHub Pages は Public リポジトリからしか公開できません。
   リンクやメモはリポジトリに入らないので、Public でも中身は公開されません。
4. **Create repository** を押します。

作った直後に Actions の「Deploy to GitHub Pages」が失敗することがありますが、
次の手順 2 の設定前に動いたためなので気にしなくて大丈夫です。

### 2. GitHub Pages を有効にする

参考：[GitHub Docs - GitHub Pages サイトの公開元を設定する](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

1. 作ったリポジトリの **Settings → Pages** を開きます。
2. **Build and deployment** の **Source** を **GitHub Actions** にします。

これで、`main` ブランチに変更を push するたびに、`public/` フォルダの中身が自動で公開されます。
公開先の URL は `https://<GitHub のユーザー名>.github.io/<リポジトリ名>/` です。

### 3. Firebase プロジェクトを作り、Google ログインを有効にする

参考：[Firebase - Google ログイン](https://firebase.google.com/docs/auth/web/google-signin?hl=ja)

1. [Firebase コンソール](https://console.firebase.google.com/) を開き、**プロジェクトを作成**します。
   名前は何でも構いません。Google アナリティクスや Gemini は使わないので、オフで大丈夫です。
2. 左メニューの **構築 → Authentication** を開き、**始める** を押します。
3. **ログイン方法** タブで **Google** を選び、**有効にする** をオンにします。
   プロジェクトのサポートメールに自分のアドレスを選んで **保存** します。

Google Cloud で OAuth クライアントを作る必要はありません（Firebase が自動で用意します）。

### 4. Firestore を作り、セキュリティルールを設定する

参考：[Firebase - Cloud Firestore を使ってみる](https://firebase.google.com/docs/firestore/quickstart?hl=ja)

1. 左メニューの **構築 → Firestore Database** を開き、**データベースの作成** を押します。
2. エディションを聞かれたら **Standard**、ロケーションは **asia-northeast1（東京）** などの近い場所を選びます
   （ロケーションは後から変更できません）。
3. セキュリティルールは **本番環境モード** を選んで作成します。
4. 作成できたら **ルール** タブを開き、このリポジトリの [`firestore.rules`](firestore.rules) の内容を**すべて**貼り付けます。
5. 貼り付けた中の次の部分を、**ログインに使う自分の Google アカウントのメールアドレス（小文字）**に書き換えます。

   ```
   function allowedEmails() {
     return ['you@example.com'];
   }
   ```

   家族などにも使わせる場合は `['a@gmail.com', 'b@gmail.com']` のように並べます。データは人ごとに別々に保存されます。
6. **公開** を押します。

> リポジトリの `firestore.rules` は手順の見本です。書き換えなくても動作には影響しません
> （Firebase に効くのは、コンソールで公開したルールです）。

### 5. Firebase の設定値をリポジトリに書く

1. Firebase コンソールの左上の歯車 → **プロジェクトの設定** を開きます。
2. **全般** タブの下の方にある **マイアプリ** で、ウェブのアイコン（`</>`）を押します。
3. アプリのニックネームを入れて **アプリを登録** します（Firebase Hosting のチェックは不要です）。
4. 表示される `firebaseConfig` の値を控えます。

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     ...
   };
   ```

5. GitHub で自分のリポジトリの `public/js/firebase-config.js` を開き、鉛筆アイコン（Edit this file）を押します。
6. `YOUR_...` となっている 6 つの値**だけ**を、控えた値に書き換えて **Commit changes** を押します。

> **ファイル全体を Firebase コンソールの見本で置き換えないでください。** 見本の
> `const firebaseConfig = {` や `import { initializeApp } ...` をそのまま貼ると、画面が真っ白になります。
> 書き換えた後は、次の形になっていれば正解です（`"..."` の部分があなたの値）。
>
> ```js
> export const firebaseConfig = {
>   apiKey: "...",
>   authDomain: "...",
>   projectId: "...",
>   storageBucket: "...",
>   messagingSenderId: "...",
>   appId: "...",
> };
>
> export const SHARED_DASHBOARD = false;
>
> export const FIREBASE_SDK_VERSION = "13.1.0";
>
> export const USE_EMULATORS_ON_LOCALHOST = false;
> ```
>
> - 1 行目は `export const firebaseConfig = {` です（`export` が必要で、`const firebaseConfig` を二重にしない）
> - 下の `SHARED_DASHBOARD`・`FIREBASE_SDK_VERSION`・`USE_EMULATORS_ON_LOCALHOST` の行も消さずに残します
>   （`SHARED_DASHBOARD` は、下の「複数のアカウントで共有する」で使います）

コミットすると、手順 2 で設定した GitHub Actions が自動で動き、1〜2 分で公開されます
（リポジトリの **Actions** タブで進み具合を確認できます）。

### 6. GitHub Pages のドメインを Firebase に登録する

1. Firebase コンソールの **Authentication → 設定 → 承認済みドメイン** を開きます。
2. **ドメインを追加** で `<GitHub のユーザー名>.github.io` を追加します（`https://` やリポジトリ名は付けません）。

これをしないと、ログインのときに「承認済みドメインに登録されていません」と表示されます。

### 7. 使い始める

`https://<GitHub のユーザー名>.github.io/<リポジトリ名>/` を開き、**Google でログイン** を押します。
手順 4 で許可したアカウントでログインすると、サンプルのレイアウトが表示されます。
右下に自分のメールアドレスが出ていれば完了です。

ブラウザのホームページやブックマークに登録しておくと便利です。

### 複数のアカウントで共有する（任意）

家族やチームなど、**複数の Google アカウントで同じダッシュボードを見て編集したい**ときの設定です。
同じ URL を開いた全員が、同じタブ・ウィジェット・リンク・メモ・ToDo を共有します。
誰かが変更すると、開いている全員の画面に数秒で反映されます。

1. 手順 4 のルールの `allowedEmails()` に、共有する全員のメールアドレスを書きます（例：`['a@gmail.com', 'b@gmail.com']`）。
   **このリポジトリの最新の `firestore.rules` を貼り付けて「公開」してください。** 共有のデータ（`dashboards/shared`）を読み書きできるのは、このルールからです。
   以前のルールのままだと「〇〇 ではこのダッシュボードを使えません」と出ます。
2. `public/js/firebase-config.js` の `SHARED_DASHBOARD` を `true` にしてコミットします。
   この行がない古いファイルの場合は、ファイルの最後に `export const SHARED_DASHBOARD = true;` を足します。

```js
export const SHARED_DASHBOARD = true;
```

- 共有を始めたとき、共有のデータがまだなければ、**最初に開いた人の今までのダッシュボード**を引き継ぎます。
  それぞれの人の今までのデータ（`dashboards/{ユーザー ID}`）は消えずに残っていて、`false` に戻せば元のダッシュボードに戻ります。
- 右下に **共有中** と表示されます。
- 2 人が同じときに編集しても、ウィジェットやタブごとに両方の変更をまとめて保存します。
  ただし **同じウィジェットを同じときに変えたとき** は、後から保存した人の内容になります。
- 次のものは共有されず、人（端末）ごとです：Google カレンダー・Gmail（それぞれ自分のものが表示されます）、GitHub のトークン、動いているタイマー、最後に開いていたタブ。
- ⚙ の設定のうち、**ライト / ダークと言語は人ごと**です（D キーで切り替えても、ほかの人の画面は変わりません）。端末ごと・アカウントごとに覚えるので、同じ PC を家族で使っても人ごとに分かれます。
  テーマ・表示密度・ダッシュボードの名前などのそのほかの設定は、全員で共通です。

### 8. API キーの使える場所を絞る（おすすめ）

`apiKey` は公開されても問題ない値ですが、他のサイトや他の用途に使われないように制限をかけておくと安心です。
手順 5 でコミットすると GitHub から「Publicly leaked secret」という警告が届きますが（下の
「GitHub から『Publicly leaked secret』の警告が届いたとき」を参照）、この制限をかけておけば心配いりません。

1. [Google Cloud コンソールの認証情報](https://console.cloud.google.com/apis/credentials) を開き、上部で Firebase のプロジェクトを選びます。
2. **API キー** の一覧から、Firebase が作ったキー（通常は「Browser key (auto created by Firebase)」）を開きます。
3. **アプリケーションの制限** を **ウェブサイト** にし、次を追加します。
   - `https://<GitHub のユーザー名>.github.io/*`
   - `https://<プロジェクト ID>.firebaseapp.com/*`（ログイン画面で使われます）
   - 手元で試す場合は `http://localhost/*` と `http://127.0.0.1/*` も
4. **API の制限** を **キーを制限** にし、次の 3 つを選びます。
   - Identity Toolkit API（ログイン）
   - Token Service API（ログイン状態の維持）
   - Cloud Firestore API（データの保存）
5. 保存して数分待ってから、ダッシュボードでログインと保存ができるか確認します。
   うまくいかなくなったら、いったん制限を外して、許可したサイトや API に漏れがないか見直してください。

### 9. カレンダーとメールのウィジェットを使う場合（任意）

Google カレンダー・Gmail のウィジェットは、ダッシュボードから Google の API を呼び出します。
使う場合だけ、Firebase と同じ Google Cloud のプロジェクトで次の設定をします。

1. [Google Cloud コンソール](https://console.cloud.google.com/) の上部で、Firebase のプロジェクトを選びます。
2. **API とサービス → ライブラリ** で、使うものを検索して **有効にする** を押します。
   - カレンダーのウィジェット：**Google Calendar API**
   - Gmail のウィジェット：**Gmail API**
3. **Google Auth Platform → データアクセス**（または **OAuth 同意画面 → スコープ**）で **スコープを追加または削除** を押し、使うものを追加して保存します。
   - `https://www.googleapis.com/auth/calendar.readonly`（カレンダーの読み取り）
   - `https://www.googleapis.com/auth/gmail.labels`（Gmail のラベルと件数。メールの本文や件名は読めません）
4. **Google Auth Platform → 対象**（Audience）で公開ステータスを確認します。
   - **テスト** の場合：**テストユーザー** に、ログインに使う自分の Google アカウントを追加します。
   - **本番環境** の場合：そのままで使えます。

手順 8 の API キーの制限は、このウィジェットには関係ありません（API キーではなく、ログイン時にもらう権限で呼び出すため）。

> カレンダーの読み取りは Google が「機密」に分類する権限で、Google の審査（確認）を受けていないアプリだと、
> 連携のときに「このアプリは Google で確認されていません」と表示されます。自分で作ったダッシュボードなので、
> **詳細 → （プロジェクト名）に移動** で進めて問題ありません。

---

## 本家の更新を取り込む

テンプレートから作ったリポジトリは本家と履歴がつながっていないため、フォークのような「Sync fork」ボタンはありません。
代わりに、次のどちらかの方法で取り込みます。

| 方法 | 向いている人 |
|---|---|
| **A. ボタンで取り込む**（GitHub Actions が Pull Request を作る） | ふだんはこちら。git のコマンドを使わずに、GitHub の画面だけで済みます |
| **B. 手元の git で取り込む** | A で「衝突しました」と出たとき、自分でファイルを直したいとき |

どちらの方法でも、Firestore のデータ（ダッシュボードの中身）はそのまま残ります。

### A. ボタンで取り込む（おすすめ）

本家の `.github/workflows/sync-template.yml`（「Sync from template」ワークフロー）を使います。
実行すると、本家の最新の `main` を取り込む Pull Request を自動で作ります。中身を見て **Merge pull request** を押せば、取り込みが完了して公開し直されます。

**最初に 1 回だけ準備すること**

1. 自分のリポジトリの **Settings → Actions → General → Workflow permissions** で、次の 2 つを設定して **Save** を押します。
   - **Read and write permissions** を選ぶ
   - **Allow GitHub Actions to create and approve pull requests** にチェックを入れる
2. 自分のリポジトリに `.github/workflows/sync-template.yml` がなければ、追加します（このファイルを入れる前にテンプレートから作った場合）。
   1. 本家の [sync-template.yml](https://github.com/kwaka1208/personal-dashboard/blob/main/.github/workflows/sync-template.yml) を開き、右上の **コピー** ボタンで中身をコピーします。
   2. 自分のリポジトリで **Add file → Create new file** を押し、名前に `.github/workflows/sync-template.yml` と入力して、中身を貼り付けて **Commit changes** を押します。

**取り込むとき**

1. 自分のリポジトリの **Actions** タブ → 左の **Sync from template** → **Run workflow** を押します。
   （毎週月曜日の朝にも自動で確認し、更新があれば Pull Request を作ります。作るだけで、勝手にマージはしません。）
2. 1 分ほどすると **Pull requests** タブに「本家（テンプレート）の更新を取り込む」ができます。中身を確認して **Merge pull request** を押します。
3. マージすると、GitHub Pages に自動で公開し直されます。

- 本家の更新がなければ、何もせずに終わります。
- `firebase-config.js`・`custom.css`・`public/addons/index.js` など自分専用のファイルは、本家の変更と衝突した場合、**自分の内容を残します**。
  衝突しなければ、本家で増えた設定（例：`SHARED_DASHBOARD`）は自動で書き足されます。
- それ以外のファイルで衝突したときや、本家で `.github/workflows` の中が変わったとき（GitHub Actions の権限では書き換えられないため）は、
  ワークフローが赤い ✗ で止まり、理由が表示されます。その場合は **B** で取り込んでください。
- 本家で `firestore.rules` が変わったときは、Firebase コンソールのルールにも反映してください（自分のメールアドレスの部分は残します）。

### B. 手元の git で取り込む

手元に clone したリポジトリで次を実行します。

最初の 1 回だけ、本家を `upstream` という名前で登録します。

```bash
git remote add upstream https://github.com/kwaka1208/personal-dashboard.git
```

本家の最新を取ってきます。

```bash
git fetch upstream
```

本家の `main` を取り込みます。

```bash
git merge upstream/main --allow-unrelated-histories
```

2 回目以降は `--allow-unrelated-histories` は不要です（`git fetch upstream` と `git merge upstream/main` だけ）。

最初の取り込みでは、あなたが変更したファイル（`firebase-config.js` など）で衝突（コンフリクト）が出ることがあります。
`firebase-config.js` は自分の値を残してください。衝突したファイルを直したら `git add` してから `git commit` し、
GitHub に push すると自動で公開し直されます。

### 衝突を減らすコツ

カスタマイズを `custom.css` と `themes.css` への追記、自作ウィジェットを `public/addons/`（アドオン）に留めておくと、衝突しにくくなります。
`public/js/app.js` などの本体のファイルを直接書き換えると、本家の更新のたびに衝突しやすくなります。

---

## ローカルで動かす（開発する人向け）

ビルドは不要です。`public/` フォルダを HTTP で配信するだけで動きます。

```bash
cd public
```

```bash
python3 -m http.server 8000
```

<http://localhost:8000> を開きます。

- `firebase-config.js` が未設定（`YOUR_...` のまま）なら「ローカルモード」で動き、データはブラウザにだけ保存されます。
  見た目の調整はこれで十分です。
- 自分の Firebase の値を入れていれば、本番と同じ Firebase につながります（`localhost` は最初から承認済みドメインです）。

### Firebase エミュレーターで試す

本番のデータに触れずにログインや保存を試したいときは、[Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite?hl=ja) を使います（Node.js と Java が必要です）。

1. `public/js/firebase-config.js` を一時的に次のようにします（コミットしないでください）。
   - `projectId` を `demo-test`、`apiKey` を `fake-api-key` にする
   - `USE_EMULATORS_ON_LOCALHOST` を `true` にする
2. `firestore.rules` の `allowedEmails()` に、テストで使うメールアドレスを書きます。
3. リポジトリのルートでエミュレーターを起動します。

   ```bash
   npx firebase-tools emulators:start --only auth,firestore --project demo-test
   ```

4. 別のターミナルで `public/` を配信し、<http://127.0.0.1:8000> を開きます。
   ログインボタンを押すと、エミュレーターの画面で好きなメールアドレスのテスト用アカウントを作れます。

### ファイル構成

```
public/                      GitHub Pages で公開されるファイル
  index.html                 画面の骨組み
  default-dashboard.json     初回表示のレイアウト
  css/                       スタイル（DESIGN.md 参照）
  js/app.js                  画面の描画・編集・ドラッグ＆ドロップ
  js/storage.js              ログインと保存（Firebase）
  js/embed.js                YouTube・画像（Google ドライブ・Dropbox）の URL を表示用に変換
  js/google.js               Google カレンダー・Gmail の API の呼び出し
  js/services.js             天気（Open-Meteo）・GitHub の API の呼び出し
  js/firebase-config.js      あなたの Firebase の設定値
  js/config.js               テーマ一覧などの設定
  js/i18n.js                 言語の切り替え（t() で文言を取り出す）
  js/locales/ja.js, en.js    画面の文言（日本語・英語）
  js/addon-api.js            アドオンを登録するための registerWidget()
  addons/index.js            使うアドオンの一覧（本家では空。WIDGET.md 参照）
  addons/countdown.js        アドオンの見本（カウントダウン）
  vendor/Sortable.min.js     並べ替えライブラリ SortableJS（MIT）
  vendor/marked.umd.js       Markdown の変換ライブラリ marked（MIT）
  vendor/purify.min.js       危険な HTML を取り除くライブラリ DOMPurify（Apache-2.0 / MPL-2.0）
README.md                    セットアップ（このファイル）
USAGE.md                     使い方（操作方法・ウィジェットごとの説明）
DESIGN.md                    見た目のカスタマイズ（CSS 変数・クラス名・テーマの作り方）
WIDGET.md                    アドオン（自作ウィジェット）の作り方
firestore.rules              Firestore のセキュリティルール（コンソールに貼り付ける見本）
firebase.json                エミュレーター用の設定
.github/workflows/pages.yml  public/ を GitHub Pages に公開する設定
```

### データの保存形式

Firestore の `dashboards/{ユーザー ID}` ドキュメント（共有するときは `dashboards/shared`）に、次の形で保存します。

| フィールド | 内容 |
|---|---|
| `json` | ダッシュボード全体（全タブ）を JSON 文字列にしたもの（設定画面の「書き出す」と同じ形式。500KB まで） |
| `updatedAt` | 最後に保存した日時（サーバーの時刻） |

---

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 「Firebase が未設定のため『ローカルモード』で動いています」 | 手順 5 で `firebase-config.js` の値を書き換えてコミットしたか。公開まで 1〜2 分かかります |
| ページが 404 になる | 手順 2 で Pages の Source を **GitHub Actions** にしたか。Actions タブで「Deploy to GitHub Pages」が成功しているか（失敗していたら **Run workflow** で再実行） |
| 「承認済みドメインに登録されていません」 | 手順 6 で `<ユーザー名>.github.io` を追加したか |
| 「Google ログインが有効になっていません」「Authentication が開始されていません」 | 手順 3 で Authentication を始め、Google を有効にしたか |
| 画面が真っ白で、左上に「Dashboard」としか出ない | ブラウザの開発者ツール（Mac は ⌥⌘I、Windows は F12）の **Console** に出ている赤いエラーを確認。下の 2 行もあわせて確認 |
| Console に `does not provide an export named 'firebaseConfig'`（または `FIREBASE_SDK_VERSION` など） | `firebase-config.js` を Firebase コンソールの見本で丸ごと置き換えていないか。手順 5 の「正解の形」に直す |
| Console に `Unexpected identifier` などの `SyntaxError`（`firebase-config.js` で発生） | `const firebaseConfig = {` が二重になっている、カッコや `"` の閉じ忘れがないか |
| 「apiKey が正しくありません」 | `firebase-config.js` の値に貼り間違いがないか |
| 手順 8 の制限をかけたらログインや保存ができなくなった | 許可したサイトに `<ユーザー名>.github.io` と `<プロジェクト ID>.firebaseapp.com` の両方があるか、API の制限に 3 つの API が入っているか |
| 「〇〇 ではこのダッシュボードを使えません」 | 手順 4 のルールの `allowedEmails()` にそのアドレスが**小文字で**入っているか、ルールを**公開**したか。共有（`SHARED_DASHBOARD = true`）にしたときは、最新の `firestore.rules` を貼り付けて公開し直したか |
| 「Firestore のデータベースが見つかりません」 | 手順 4 で Firestore Database を作成したか |
| カレンダー・Gmail のウィジェットに「Google Cloud で『Google Calendar API』（または『Gmail API』）が有効になっていません」 | 表示されたリンクを開き、Firebase と同じプロジェクトで **有効にする** を押す（手順 9）。反映に数分かかるので、待ってから ↻ |
| カレンダー・Gmail のウィジェットに「必要な権限が許可されていません」 | 手順 9 の 3 で権限（スコープ）を追加したか。追加後は「連携し直す」で、確認画面のチェックをすべて入れて許可する |
| 「ポップアップがブロックされました」 | ブラウザでこのサイトのポップアップを許可して、もう一度ログイン |
| 変更が反映されない | Actions タブで最新の「Deploy to GitHub Pages」が成功しているか確認し、キャッシュを無視して再読み込み（Mac は ⌘⇧R、Windows は Ctrl+Shift+R）。GitHub Pages のファイルはブラウザに最大 10 分ほどキャッシュされます |
| 画面の上に「アドオンを読み込めませんでした」「アドオン『〇〇』を組み込めませんでした」 | `public/addons/index.js` の `import` のファイル名が合っているか、アドオンのファイルに書き間違いがないか（Console に詳しいエラーが出ます）。[WIDGET.md](WIDGET.md) を参照 |
| ウィジェットに「アドオン『〇〇』が見つかりません」 | そのアドオンを `public/addons/index.js` から外していないか。外してもデータは残っているので、戻せば元どおり表示されます |
| GitHub から「Publicly leaked secret」の警告が届いた | 下の「GitHub から『Publicly leaked secret』の警告が届いたとき」を参照 |

### GitHub から「Publicly leaked secret」の警告が届いたとき

`firebase-config.js` に `apiKey` をコミットすると、GitHub のシークレットスキャンが Google の API キーとして検出し、
「Publicly leaked secret」という警告を出します。GitHub は Firebase 用のキーかどうかを区別しないためです。

Firebase のウェブ用 API キーは、画面のプログラムに埋め込んで公開する前提の値です。
データを守っているのは Firestore のセキュリティルールなので、キーが知られてもダッシュボードの中身は読まれません。
キーを作り直しても、新しいキーをコミットすればまた同じ警告が出ます。

1. 手順 8 の制限をかけます（まだの場合）。
2. 警告の画面で **Close as → Won't fix** を選び、コメントに「Firebase のウェブ用キー。公開前提で、使えるサイトと API を制限済み」などと書いて閉じます。

キーを作り直したい場合は、次の順で進めます（逆の順にすると、ログインできない時間ができます）。

1. 同じ認証情報の画面で **認証情報を作成 → API キー** を押し、手順 8 と同じ制限をかけます。
2. `firebase-config.js` の `apiKey` を新しいキーに書き換えてコミットし、ログインと保存ができることを確認します。
3. 古いキーを削除し、警告を **Close as → Revoked** で閉じます。

念のため、Firebase コンソールの **Authentication → ユーザー** に知らないアカウントがないか、
**Firestore → 使用状況** で読み書きの回数が急に増えていないかも確認しておくと安心です
（知らないアカウントがあっても、ルールによりデータは読めません。不要なら削除してください）。

## ライセンス

[MIT](LICENSE)
