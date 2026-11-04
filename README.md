# personal-dashboard

よく使うツールへのリンクやメモをまとめた、**自分専用のダッシュボード**です。
Google アカウントでログインした本人だけが、中身を見たり編集したりできます。

- 画面のレイアウトはドラッグ＆ドロップで自由に並べ替え
- リンク集・ToDo・写真・Google カレンダー・Gmail・天気・タイマー（ポモドーロ）・世界時計・習慣トラッカー・GitHub・メモ（Markdown）・時計・Web 検索・埋め込み（YouTube など）の 14 種類のウィジェット
- ブラウザのアドレスバーから URL をドラッグ＆ドロップするだけでリンクを追加
- 編集内容は Firebase（Cloud Firestore）に自動保存されるので、PC でもスマホでも同じ画面
- 見た目はテーマで切り替え、CSS 変数（デザイントークン）で丸ごと着せ替えも可能
- このリポジトリは**テンプレート**です。コピーして自分のリポジトリを作れば、誰でも自分用のダッシュボードを無料で持てます

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
> export const FIREBASE_SDK_VERSION = "13.1.0";
>
> export const USE_EMULATORS_ON_LOCALHOST = false;
> ```
>
> - 1 行目は `export const firebaseConfig = {` です（`export` が必要で、`const firebaseConfig` を二重にしない）
> - 下の `FIREBASE_SDK_VERSION` と `USE_EMULATORS_ON_LOCALHOST` の 2 行も消さずに残します

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

## 使い方

| 操作 | 方法 |
|---|---|
| 編集を始める／終える | 右上の **編集** ボタン（編集中は **完了**） |
| ウィジェットを並べ替える | 編集中に、見出し左の **⠿** をドラッグ |
| リンクを並べ替える・別のウィジェットへ移す | 編集中に、リンクをドラッグ |
| ウィジェットを追加 | 編集中に、末尾の **＋ ウィジェットを追加** |
| ウィジェットの名前・幅・高さ・色を変える | 編集中に、見出し右の **✎** |
| リンクを追加（ドラッグ＆ドロップ） | ブラウザの**アドレスバー**の URL（または他のページのリンク）を、リンク集ウィジェットの上にドラッグして離す。編集中でなくても使えます |
| リンクを追加（入力して） | 編集中に、リンク集の見出し右の **＋** |
| リンクを編集・削除 | 編集中に、リンクをクリック（または **✎**） |
| リンクを絞り込む | 上部の検索欄（`/` キーで移動、Enter で先頭のリンクを開く） |
| タブを切り替える | 上部のタブをクリック（Alt〔Mac は option〕＋数字キー、タブ上で ← → キーでも可） |
| タブを追加・名前変更・複製・削除・並べ替え | 編集中に、いちばん右のタブの右の **＋ タブを追加** / タブ名の右の **✎** **⧉** **×** / 左の **⠿** をドラッグ |
| ウィジェットを別のタブへ移す | 編集中に、ウィジェットの **✎** →「タブ」で移動先を選ぶ |
| テーマ・配色・表示密度・バックアップ | 右上の **⚙** |
| 編集画面（ダイアログ）を保存する / やめる | 入力欄で **Enter**、または **保存** / **Esc**、または **キャンセル**（複数行の入力欄では Enter は改行） |
| ログアウト | 右下の **ログアウト**（この端末に残した控えも消えます） |

スマートフォンでは、少し長押ししてからドラッグすると並べ替えられます。

### ウィジェットの種類

| 種類 | できること |
|---|---|
| リンク集 | リンクを「リスト」または「タイル」で表示。アイコンは絵文字・画像 URL・サイトのファビコンから選べます |
| ToDo | カテゴリー（仕事・プライベートなど）ごとに ToDo を管理。下の「ToDo の使い方」を参照 |
| 写真 | 画像の URL を登録してスライドショー表示。下の「写真を表示する」を参照 |
| Google カレンダー | 今日から数日分の予定を一覧表示。下の「カレンダーとメール」を参照 |
| Gmail | 受信トレイなどの未読件数を表示。下の「カレンダーとメール」を参照 |
| 天気 | 地域の今の天気と、明日からの予報。下の「天気」を参照 |
| タイマー・ポモドーロ | 作業と休憩をくり返すポモドーロ、または決めた時間のタイマー。下の「タイマー・ポモドーロ」を参照 |
| 世界時計 | 複数の都市の時刻と、日本との時差を一覧表示 |
| 習慣トラッカー | 毎日の習慣を記録して、続いた日数を表示。下の「習慣トラッカー」を参照 |
| GitHub | レビュー依頼・自分のプルリクエスト・担当の Issue を一覧表示。下の「GitHub」を参照 |
| メモ | 自由に書けるメモ欄。入力すると自動保存。Markdown で見出し・箇条書き・チェックボックス・リンクなどが使える（下の「メモ（Markdown）」を参照） |
| 時計 | 現在時刻と日付。タイムゾーン（例：`America/New_York`）も指定可能 |
| Web 検索 | 検索 URL を変えれば Google 以外（社内 Wiki、GitHub 検索など）にも使えます |
| 埋め込み | YouTube の動画・プレイリスト、Google カレンダーの埋め込み URL など。下の「YouTube を埋め込む」を参照 |

### タブ

「仕事」「プライベート」「趣味」のように、ダッシュボードをタブで分けて管理できます。
タブごとに別々のウィジェットを置けます（テーマやダッシュボードの名前は全タブ共通です）。

- 最初はタブが 1 つ（ホーム）で、タブ列は編集中だけ表示されます。タブを 2 つ以上にすると、いつも表示されます。
- 編集中に、いちばん右のタブの右にある **＋ タブを追加** で増やし、タブ名の右の **✎** で名前を変え、**×** で削除します（中のウィジェットも消えます）。
- タブ名の右の **⧉** で、タブを中のウィジェットごと複製できます。複製は元のタブのすぐ右に「〇〇 のコピー」という名前で入ります
  （リンク・ToDo・メモなどの中身もコピーされ、それぞれ別々に編集できます。タイマーの経過時間はコピーされません）。
- タブ名の左の **⠿** をドラッグすると、タブの順番を変えられます。
- ウィジェットを別のタブへ移すには、ウィジェットの **✎** を押し、「タブ」で移動先を選んで保存します。
- 最後に開いていたタブは、端末（ブラウザ）ごとに覚えています。
- URL の最後が `#タブの ID` になるので、特定のタブをブックマークしておくこともできます。

### 大きさ（幅と高さ）

ウィジェットはマス目（タイル）に沿って並びます。編集中に見出し右の **✎** から、幅と高さを選べます。

| 項目 | 選べる値 |
|---|---|
| 幅 | S（1 列）・M（2 列）・L（3 列）・XL（全幅） |
| 高さ | 1 段・2 段・3 段・4 段（1 段は約 150px） |

- 中身が段に収まらないときは、そのウィジェットの中だけスクロールします。
- メモと埋め込み（YouTube など）は、ウィジェットの高さいっぱいに広がります。
- 高さの初期値は種類ごとに決まっています（時計・Web 検索・Gmail は 1 段、ToDo・カレンダー・GitHub は 3 段、そのほかは 2 段）。
- 種類によっては、中身が使えなくなる小ささにならないよう**最小サイズ**があり、それより小さい幅・高さは選べません。
  すでに小さく設定してあったウィジェットは、最小サイズまで自動で広がります。

  | 種類 | 最小サイズ |
  |---|---|
  | ToDo・習慣トラッカー | 幅 M・2 段 |
  | 埋め込み・Google カレンダー・タイマー・GitHub | 幅 S・2 段 |
  | そのほか | 幅 S・1 段 |
- 画面が狭くなると、自動で 2 列 → 1 列に詰まります（高さの段数はそのままです）。
- 並び順はドラッグで決まり、マス目は左上から順に埋まります。すき間ができたら、幅・高さや並び順を調整してください。

マス目にそろえず、それぞれの中身の高さで並べたい場合は、⚙ の **ウィジェットの高さ** を **中身に合わせる** にします。
このときは段の指定を使わず、埋め込みは「高さ（px）」で指定した高さになります。

> **リンクのアイコン**：アイコンを設定していないリンクは、そのページのファビコン（サイトのアイコン）を自動で表示します。
> まず Google のファビコン取得サービス（Chrome などが使っているもの）で探し、見つからなければサイトの `/favicon.ico`、
> それもなければ表示名の頭文字を表示します。Google ドキュメント・スプレッドシートのように、同じドメインでもページごとのアイコンが出ます。
> このとき Google には「ドメイン＋最初の階層」（例：`https://docs.google.com/document/`）だけを送り、
> 文書の ID や検索条件など、それより後ろの部分は送りません。気になる場合は ⚙ の「サイトのファビコンを表示する」をオフにすると、
> どこにも問い合わせず頭文字だけを表示します。

### リンクをドラッグ＆ドロップで追加する

1. 追加したいページをブラウザの別のタブやウィンドウで開きます。
2. アドレスバーの URL（Chrome や Edge は左端の鍵などのアイコン、Safari や Firefox は URL の文字）を
   ダッシュボードのタブまでドラッグし、リンク集ウィジェットの上で離します。
   ドロップできるウィジェットは点線で囲まれます。
3. 画面下に「〇〇を追加しました」と出たら完了です。**名前を編集** を押すと、表示名やアイコンを変えられます。

ページ名が取れない場合はドメイン名で登録されます。同じ URL がすでにあるウィジェットには追加されません。
ウィンドウを左右に並べておくと、ドラッグしやすくなります。

### メモ（Markdown）

メモはふだん書式を整えて表示し、クリックすると編集に切り替わります（Esc か、ほかの場所をクリックで表示に戻ります）。

```markdown
# 見出し
- 箇条書き
- [ ] チェックボックス（表示中にクリックで切り替え）
**太字** / `コード` / [リンク](https://example.com) / > 引用
```

表示中のチェックボックスをクリックすると、元の文章の `[ ]` / `[x]` も書き換わって保存されます。
書式を使わず、文字のまま表示したい場合は、ウィジェットの **✎** で「Markdown で書式を付けて表示する」をオフにします。

### カレンダーとメール

Google カレンダーと Gmail のウィジェットは、セットアップの **手順 9** を済ませると使えます。
ウィジェットを追加したら、中の **Google と連携** を押して、ダッシュボードにログインしているのと同じ Google アカウントで許可します。

| ウィジェット | 表示するもの | 設定（ウィジェットの ✎） |
|---|---|---|
| Google カレンダー | 今日から指定日数の予定（終わった予定は除く）。進行中の予定は強調、Meet があれば参加ボタン。予定をクリックで Google カレンダーを開く | 期間（今日だけ〜2 週間）、表示中のカレンダーをすべて含めるか |
| Gmail | 未読の件数。クリックで Gmail を開く | 数える未読（受信トレイ・メイン・重要・スター付き） |

- 連携の有効期限は**約 1 時間**です（ブラウザだけで動く仕組みのため、自動では延長できません）。
  切れると **連携し直す** ボタンが出るので、押してください。
- 連携中は 10 分ごとに自動で読み込み直します。すぐに最新にしたいときは右上の **↻** を押します（カレンダーは見出しの右端。マウスを乗せると最後に読み込んだ時刻が出ます）。
- 予定や件数は表示のために読み込むだけで、ダッシュボードのデータ（Firestore）には保存しません。
  連携の情報（アクセストークン）は、この端末のブラウザにだけ有効期限つきで保存し、ログアウトすると消えます。
- Gmail のウィジェットが使う権限では、メールの本文や件名は読めません（件数だけ）。

### 天気

ウィジェットの **✎** で地域を入れます（例：東京、大阪、札幌、London）。**現在地を使う** を押すと、ブラウザの位置情報で今いる場所を設定できます。

- 今の天気・気温・体感温度・湿度・風・降水確率と、明日から 6 日分の予報（幅が狭いときは入る分だけ）を表示します。
- 天気のデータは [Open-Meteo](https://open-meteo.com/)（登録・API キー不要、無料）から 30 分ごとに読み込みます。
- 日本語の地名が見つからないときは、「札幌市」のような正式な名前か、ローマ字（Sapporo）で試してください。

### タイマー・ポモドーロ

ウィジェットの **✎** で種類を選びます。

| 種類 | 動き |
|---|---|
| ポモドーロ | 作業（初期 25 分）と休憩（5 分）をくり返し、4 回ごとに長い休憩（15 分）。**⏭** で次へ進めます |
| タイマー | 決めた分数（初期 10 分）を数えて、終わったら止まります |

- 終わると画面下にお知らせが出て、音が鳴ります（✎ でオフにできます）。
  最初に **開始** を押したときにブラウザから通知の許可を求められ、許可すると、ほかのタブを見ているときも通知が届きます。
- 動いているタイマーは、この端末のブラウザだけで数えます（ほかの端末とは共有しません）。再読み込みしても続きから数えます。
- ブラウザのタブを長い時間裏にしていると、ブラウザの省電力の仕組みで、終わりのお知らせが少し遅れることがあります。

### 世界時計

ウィジェットの **✎** で、1 行に 1 都市ずつ「表示名=タイムゾーン」の形で書きます（例：`パリ=Europe/Paris`）。
タイムゾーンの名前は [tz database の一覧（英語）](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) の「TZ identifier」で調べられます。
各都市の時刻・昼夜（☀️ / 🌙）・日付（今日 / 明日 / 昨日）・この端末との時差を表示します。

### 習慣トラッカー

編集中に見出しの **＋** で習慣（例：運動、読書、日記）を追加し、毎日、その日の丸をクリックして記録します。

- 表示する日数は 7 日か 14 日（✎ で変更）。今日の列は色付きで表示します。
- 右端の 🔥 は、今日（今日がまだなら昨日）まで続けて記録した日数です。
- 習慣の名前の変更・削除は、編集中に名前の右の **✎** / **×** で行います。記録は約 1 年分を残します。

### GitHub

自分に関係する、開いているプルリクエストと Issue を一覧表示します。

1. GitHub の [Fine-grained personal access token の作成画面](https://github.com/settings/personal-access-tokens/new) でトークンを作ります。
   - Repository access：見たいリポジトリ（または All repositories）
   - Permissions：**Pull requests** と **Issues** を **Read-only**（Metadata の Read-only は自動で付きます）
   - Expiration：好きな期限（切れたら作り直します）
2. ウィジェットの **トークンを設定** を押して、作ったトークンを貼り付けます。

- 表示する一覧（レビュー依頼・自分のプルリクエスト・担当の Issue）と件数は、✎ で選べます。5 分ごとに読み込み直します。
- トークンは**この端末のブラウザにだけ**保存し、ダッシュボードのデータ（Firestore）には保存しません。
  別の端末で使うときは、その端末でも設定してください。ログアウトすると消えます。
  ✎ の **この端末のトークンを削除** でも消せます。
- 非公開のリポジトリは、トークンでアクセスを許可したものだけが表示されます。

### 写真を表示する

写真ウィジェット（編集中の **＋ ウィジェットを追加** で種類に「写真」を選ぶ）は、
登録した画像を 1 枚ずつ表示するスライドショーです。

| 操作 | 方法 |
|---|---|
| 写真を追加（URL） | 編集中に、見出し右の **＋** を押して画像の URL を貼る |
| 写真を追加（ドラッグ） | ほかのタブで開いている画像を、写真ウィジェットの上にドラッグして離す（編集中でなくても可） |
| 前後の写真へ | 写真にマウスを乗せると出る **‹** **›** |
| 元の画像を開く | 写真をクリック |
| キャプション・削除・並べ替え | 編集中に、一覧の **✎** / **×** / ドラッグ |
| 見せ方・自動切り替え | ウィジェットの **✎** で「枠いっぱいに表示 / 写真全体を表示」と、切り替える間隔（切り替えない〜5 分）を選ぶ |

- 写真ファイルそのものは保存しません。登録するのは画像の URL だけで、表示のたびにその URL から読み込みます。
  そのため、元の画像が削除されたり非公開になったりすると表示されなくなります。
- **Google ドライブ**：画像ファイルの共有を「リンクを知っている全員」にして、共有リンク（`https://drive.google.com/file/d/…/view`）を
  そのまま貼れば表示できます（表示用の URL に自動で変換します）。
- **Dropbox**：共有リンク（`…?dl=0`）をそのまま貼れます。
- **Google フォト**の共有リンク（`photos.app.goo.gl/…`）は画像そのものの URL ではないため使えません。
  Google ドライブに保存した写真を使うか、アルバムの写真を開いて右クリック →「画像アドレスをコピー」した URL を使ってください
  （この URL は長期間たつと使えなくなることがあります）。
- 画像のサイトによっては、ほかのサイトからの表示を禁止していて読み込めないことがあります。
- 自動切り替えは、写真にマウスを乗せている間と、ブラウザのタブが裏にある間は止まります。

### YouTube を埋め込む

YouTube の URL は、埋め込みウィジェットにそのまま貼るだけで動画プレーヤーとして表示されます。
「共有」ボタンの埋め込みコード（`<iframe ...>`）を探す必要はありません。

1. 編集中に **＋ ウィジェットを追加** を押し、種類で **埋め込み** を選びます。
2. 「埋め込む URL」に、ブラウザのアドレスバーや「共有」でコピーした YouTube の URL を貼ります。
3. **保存** を押すと、幅に合わせた 16:9 のプレーヤーになります（高さの指定は不要です）。

すでにある埋め込みウィジェットに、アドレスバーから YouTube の URL をドラッグ＆ドロップして差し替えることもできます
（間違えたときは、画面下の **元に戻す** で戻せます）。

| 貼れる URL の例 | 表示 |
|---|---|
| `https://www.youtube.com/watch?v=...` / `https://youtu.be/...` | 動画 |
| `https://www.youtube.com/watch?v=...&t=90s` / `https://youtu.be/...?t=1m30s` | 指定した時刻から再生 |
| `https://www.youtube.com/playlist?list=...`、`watch?v=...&list=...` | プレイリスト |
| `https://www.youtube.com/shorts/...` | ショート動画（縦長で表示） |
| `https://www.youtube.com/live/...` | ライブ配信 |

埋め込みにはプライバシー強化モード（`youtube-nocookie.com`。再生するまで Cookie を使わない）を使います。
動画の投稿者が埋め込みを許可していない場合は、YouTube 側のエラーが表示されます。

### ToDo の使い方

ToDo ウィジェット（編集中の **＋ ウィジェットを追加** で種類に「ToDo」を選ぶ）は、
1 つのウィジェットの中でカテゴリーごとに ToDo を分けて管理できます。
最初は「仕事」「プライベート」の 2 つのカテゴリーがあります。

| 操作 | 方法 |
|---|---|
| ToDo を追加 | 入力欄に内容を書き、右のプルダウンでカテゴリーを選んで **追加**（Enter でも可） |
| 完了にする | チェックボックスをクリック。完了したものは取り消し線になります |
| 削除する | 行にマウスを乗せると出る **×** |
| カテゴリーで絞り込む | 上の「すべて / 仕事 / プライベート」のボタン（数字は未完了の件数） |
| 完了したものをまとめて削除 | 下の **完了した n 件を削除**（絞り込み中は、そのカテゴリーの分だけ） |
| カテゴリーを追加 | 編集中に、ウィジェットの見出し右の **＋** |
| カテゴリーの名前を変える・削除 | 編集中に、カテゴリー名の右の **✎** / **×**（削除すると中の ToDo も消えます） |
| ToDo の内容を書き直す | 編集中に、ToDo の文字をクリック |
| 並べ替え・別のカテゴリーへ移す | 編集中に、ToDo をドラッグ |
| カテゴリーの並べ替え | 編集中に、カテゴリー名の左の **⠿** をドラッグ |

### テーマ

⚙ の設定画面に各テーマの見本が並んでいて、クリックするとその場で画面全体が切り替わります
（「保存」を押すと確定、「キャンセル」で元に戻ります）。

| テーマ | 雰囲気 |
|---|---|
| 標準 | 生成りの背景に白いカード。落ち着いた緑のアクセント |
| グラス | にじんだ色の背景に、すりガラスのような半透明カード |
| ブルータル | 太い黒線とずらした影、黄色のアクセント。大文字の見出し |
| ターミナル | 黒地に蛍光グリーンの等幅文字。時計が光る（常にダーク） |
| ミッドナイト | 濃紺と金。字間を広げた上品な見出し（ライトでは生成りと金） |
| エディトリアル | 雑誌のように箱をなくし、太い罫線と余白で区切る。明朝体の見出し |
| 藍 / 和紙 / モノクロ | 標準の形のまま、色合いだけを変えたもの |

どのテーマも、配色（OS に合わせる / ライト / ダーク）と表示密度（標準 / コンパクト）を組み合わせられます。

フォントは各 OS に最初から入っているものだけを使います（明朝体の見出しも、ヒラギノ明朝・游明朝などの OS 標準フォントです）。

### バックアップ

⚙ → **書き出す（JSON）** で、ダッシュボード全体を JSON ファイルとして保存できます。
**読み込む** で復元できます。別の人のレイアウトを取り込むこともできます。

---

## 見た目をカスタマイズする

CSS は役割ごとにファイルを分け、[カスケードレイヤー（`@layer`）](https://developer.mozilla.org/ja/docs/Web/CSS/@layer)で
優先順位を固定しています。後ろのレイヤーほど強く、**詳細度（セレクターの強さ）を気にせず上書きできます**。

```
tokens  <  base  <  layout  <  components  <  themes  <  custom
```

| ファイル | 中身 | 編集の目安 |
|---|---|---|
| `public/css/tokens.css` | 色・フォント・余白・角丸・列数などの **CSS 変数** | 本家の標準値。直接変えてもよい |
| `public/css/base.css` | リセットと文字の基本設定 | ふつうは触らない |
| `public/css/layout.css` | ヘッダー・グリッド・レスポンシブ | 列の割り当てを変えたいとき |
| `public/css/components.css` | ウィジェット・リンク・ボタン・ダイアログ | 部品の形を変えたいとき |
| `public/css/themes.css` | 設定画面で選べるテーマ（変数の上書きだけで作っています） | テーマを増やしたいとき |
| `public/css/custom.css` | **あなた専用の上書き用（初期状態は空）** | **まずはここに書く** |

### いちばん簡単な方法：custom.css で変数を上書きする

ほとんどの見た目は CSS 変数で決まっているので、`custom.css` で変数を上書きするだけで変わります。

```css
@layer custom {
  :root {
    /* light-dark(ライトモードの色, ダークモードの色) */
    --color-accent: light-dark(#7a3fb0, #c9a2f0);
    --color-bg:     light-dark(#f7f4fb, #15121a);
    --radius-lg: 20px;
    --grid-columns: 5;   /* 広い画面での列数 */
    --font-heading: var(--font-serif);   /* 見出しだけ明朝体に */
  }
}
```

ここで書いた値は、どのテーマを選んでいても優先されます。
特定のテーマのときだけ変えたい場合は `:root[data-preset="glass"] { ... }` のように書きます。

本家は `custom.css` を空のまま保つので、本家の更新を取り込むときに衝突しません。

### 主な CSS 変数

| 変数 | 意味 |
|---|---|
| `--color-bg` / `--color-surface` | ページの背景色 / カードの背景色 |
| `--color-surface-muted` / `--color-surface-hover` | 控えめな面（タイル・メモ欄）/ ホバー時 |
| `--color-text` / `--color-text-muted` | 文字色 / 補足の文字色 |
| `--color-accent` / `--color-accent-contrast` | アクセント色 / その上に載せる文字色 |
| `--color-border` / `--color-danger` / `--color-focus` | 枠線 / 削除ボタン / フォーカス枠 |
| `--font-sans` / `--font-serif` / `--font-mono` | 本文 / 明朝体 / 等幅のフォント（すべて各 OS の標準フォント） |
| `--font-heading` | 見出し（ダッシュボード名・ウィジェット名）のフォント |
| `--font-size-*`（`xs` `sm` `md` `lg` `xl` `clock`） | 文字サイズ |
| `--space-1` 〜 `--space-6` | 余白の段階（4px 〜 32px） |
| `--radius-sm` / `--radius-md` / `--radius-lg` | 角丸 |
| `--shadow-widget` / `--shadow-raised` | ウィジェット / ダイアログ・ドラッグ中の影 |
| `--page-max-width` / `--page-gutter` | ページの最大幅 / 画面端の余白 |
| `--grid-columns` / `--grid-gap` | 広い画面での列数 / ウィジェットの間隔 |
| `--grid-row-height` | タイル表示の 1 段の高さ（標準 150px、表示密度「コンパクト」では 140px） |
| `--widget-padding` | ウィジェット内側の余白 |
| `--link-tile-min` / `--icon-size` / `--icon-size-tile` | タイル 1 個の最小幅 / アイコンの大きさ |
| `--widget-accent` | ウィジェットごとの色（✎ で設定した色が入る。未設定なら `--color-accent`） |

ページやカードの「形」を決める変数もあります。テーマはこれらの組み合わせでできています。

| 変数 | 意味 | 例 |
|---|---|---|
| `--page-bg` | ページの背景（グラデーションや画像も可） | `radial-gradient(...), var(--color-bg)` |
| `--header-bg` / `--header-border` | 上部ヘッダーの背景 / 下線 | `transparent` / `2px solid` |
| `--app-title-font` / `-size` / `-weight` / `-spacing` / `-transform` / `-color` | ダッシュボード名の文字組み | `0.12em` / `uppercase` |
| `--app-title-fill` | ダッシュボード名をグラデーション文字に（`--app-title-color: transparent` と併用） | `linear-gradient(90deg, #f0c, #0cf)` |
| `--widget-bg` / `--widget-border` / `--widget-radius` | カードの背景 / 枠線 / 角丸 | `transparent` / `0` / `22px` |
| `--widget-shadow` / `--widget-shadow-hover` | カードの影 / ホバー時の影 | `5px 5px 0 #111` |
| `--widget-hover-translate` | ホバー時にカードをずらす量 | `-3px -3px` |
| `--widget-backdrop` | カードの背後のぼかし（すりガラス） | `blur(18px) saturate(1.5)` |
| `--widget-header-border` | ウィジェット名の下線 | `2px solid var(--color-text)` |
| `--widget-title-font` / `-size` / `-weight` / `-spacing` / `-transform` / `-color` | ウィジェット名の文字組み | `0.18em` / `uppercase` |
| `--widget-title-prefix` | ウィジェット名の前に付ける文字 | `"> "` |
| `--link-radius` / `--link-hover-bg` / `--link-hover-color` | リンクの角丸 / ホバー時の背景・文字色 | `0` / `var(--color-accent)` |
| `--tile-bg` / `--tile-border` | タイル表示のリンクの背景 / 枠線 | `transparent` / `1px solid` |
| `--button-radius` / `--button-shadow` / `--input-bg` / `--search-radius` | ボタン・入力欄の形 | `0` / `3px 3px 0 #111` |
| `--note-bg` | メモ欄の背景 | |
| `--clock-font` / `--clock-weight` / `--clock-color` / `--clock-glow` | 時計の文字 | `0 0 14px rgb(61 255 139 / 0.55)` |

### 部品ごとに変える

クラス名は「部品\_\_要素--状態」（BEM）で付けています。

```css
@layer custom {
  /* 壁紙を敷いて、カードをすりガラス風に（変数だけで書けます） */
  :root {
    --page-bg: url("../images/wallpaper.jpg") center / cover, var(--color-bg);
    --widget-bg: color-mix(in srgb, var(--color-surface) 70%, transparent);
    --widget-backdrop: blur(12px);
    --header-bg: transparent;
  }

  /* 特定の種類のウィジェットだけ変える */
  .widget--clock .clock__time { color: var(--widget-accent); }

  /* 特定のウィジェットだけ変える（data-id は書き出した JSON で確認できます） */
  .widget[data-id="google"] { background: var(--color-surface-muted); }

  /* カードの上辺をウィジェットの色で塗る */
  .widget { border-top: 3px solid var(--widget-accent); }

  /* 編集モードのときだけ効かせる */
  [data-editing] .widget { outline: 2px dashed var(--widget-accent); }
}
```

| 主なクラス・属性 | 対象 |
|---|---|
| `.app-header`, `.app-header__title` | 上部のヘッダー / ダッシュボード名 |
| `.dashboard` | ウィジェットを並べるグリッド |
| `.widget`, `.widget--links` / `--note` / `--clock` / `--search` / `--embed` | ウィジェット（種類別） |
| `.widget[data-size="s"]`（`m` `l` `xl`） | 幅ごと |
| `.widget[data-rows="1"]`（`2` `3` `4`） | 高さ（段数）ごと |
| `.widget[data-accent]` | ✎ で色を設定したウィジェット（見出しの前に色の丸が付く） |
| `.widget__header`, `.widget__title`, `.widget__title-text`, `.widget__body` | ウィジェットの見出し・本文 |
| `.link-list--list`, `.link-list--grid` | リンクのリスト表示 / タイル表示 |
| `.link`, `.link__icon`, `.link__title`, `.link__desc` | リンク 1 件 |
| `.note`, `.clock__time`, `.clock__date`, `.web-search`, `.embed` | 各ウィジェットの中身 |
| `.embed--video`, `.embed--vertical` | YouTube の埋め込み / そのうちショート動画（縦長） |
| `.photo`, `.photo--cover` / `--contain`, `.photo__img`, `.photo__caption`, `.photo__nav`, `.photo__dot` | 写真ウィジェット（見せ方別）/ 画像 / キャプション / 前後ボタン / 枚数の点 |
| `.markdown`（`.note--view`） | Markdown で表示しているメモ（中の `h1`〜`h6`・`ul`・`code` などを調整できます） |
| `.cal-day`, `.cal-event`, `.cal-event.is-now`, `.cal-event__time`, `.cal-event__title` | カレンダーの日ごとのまとまり / 予定 / 進行中の予定 / 時刻 / 件名 |
| `.mail`, `.mail__count` | Gmail の未読件数 |
| `.weather`, `.weather__temp`, `.weather__day` | 天気 / 今の気温 / 1 日分の予報 |
| `.timer`, `.timer--work` / `--short` / `--long` / `--timer`, `.timer__time`, `.timer__bar-fill` | タイマー（状態別）/ 残り時間 / 進み具合のバー |
| `.wclock__row`, `.wclock__time`, `.wclock__diff` | 世界時計の 1 都市 / 時刻 / 時差 |
| `.habit__table`, `.habit__cell`, `.habit__cell.is-done`, `.is-today` | 習慣トラッカーの表 / 記録の丸 / 記録済み / 今日の列 |
| `.gh-list`, `.gh-item`, `.gh-list__count` | GitHub の一覧 / 1 件 / 件数 |
| `.todo__form`, `.todo-chip`, `.todo-group`, `.todo-group__header`, `.todo-item`, `.todo-item--done`, `.todo-item__check` | ToDo の入力欄・絞り込みボタン・カテゴリー・1 件ごとの行 |
| `.widget.is-drop-target` | URL をドラッグして、ドロップできる状態のリンク集 |
| `.toast` | 画面下に一時的に出るお知らせ |
| `.tabs`, `.tab`, `.tab[aria-selected="true"]`, `.tabs__add` | タブ列 / タブ 1 つ / 表示中のタブ / タブの追加ボタン |
| `.button`, `.button--primary`, `.input`, `.dialog` | ボタン・入力欄・ダイアログ |
| `html[data-mode="light"]`（`dark`） | 配色を固定しているとき（自動のときは付かない） |
| `html[data-preset="..."]` | テーマを選んでいるとき（標準のときは付かない） |
| `html[data-density="compact"]` | 表示密度「コンパクト」のとき |
| `html[data-layout="flow"]` | ウィジェットの高さを「中身に合わせる」にしているとき（タイル表示のときは付かない） |
| `html[data-editing]` | 編集モード中 |

### テーマを増やす

設定画面の「テーマ」に選択肢を足すこともできます。

1. `public/css/themes.css` にブロックを追加します。**変数の上書きだけで書く**のがルールです。
   こうすると、設定画面の見本も自動でそのテーマの見た目になります
   （見本の要素にも `data-preset` が付いていて、中では同じ変数が使われるため）。
   セレクターは `:root[...]` ではなく `[data-preset="..."]` と書いてください。

   ```css
   @layer themes {
     [data-preset="sakura"] {
       --color-bg:     light-dark(#fdf3f5, #1c1416);
       --color-accent: light-dark(#c2185b, #f48fb1);
       --page-bg: linear-gradient(160deg, light-dark(#ffe4ec, #2a1520), var(--color-bg) 60%);
       --widget-radius: 24px;
       --widget-title-prefix: "🌸 ";
     }
   }
   ```

2. `public/js/config.js` の `THEME_PRESETS` に `{ id: "sakura", label: "桜" }` を追加します。

常にダークで表示したいテーマは、ブロックの中に `color-scheme: dark;` を書きます（「ターミナル」がこの例です）。

### 初期レイアウトを変える

ログインして**初めて**開いたときのレイアウトは `public/default-dashboard.json` です。
リポジトリを Public にしている場合は、**人に見られて困るリンクは書かないでください**
（自分のリンクは画面から追加すれば Firestore に保存され、公開されません）。

---

## 本家の更新を取り込む

テンプレートから作ったリポジトリは本家と履歴がつながっていないため、フォークのような
「Sync fork」ボタンはありません。更新を取り込みたいときは、手元に clone したリポジトリで次を実行します。

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
GitHub に push すると自動で公開し直されます。Firestore のデータはそのまま残ります。

本家で `firestore.rules` が変わったときは、Firebase コンソールのルールにも反映してください
（自分のメールアドレスの部分は残します）。

カスタマイズを `custom.css` と `themes.css` への追記に留めておくと、衝突しにくくなります。

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
  css/                       スタイル（上記「見た目をカスタマイズする」参照）
  js/app.js                  画面の描画・編集・ドラッグ＆ドロップ
  js/storage.js              ログインと保存（Firebase）
  js/embed.js                YouTube・画像（Google ドライブ・Dropbox）の URL を表示用に変換
  js/google.js               Google カレンダー・Gmail の API の呼び出し
  js/services.js             天気（Open-Meteo）・GitHub の API の呼び出し
  vendor/marked.umd.js       Markdown の変換ライブラリ marked（MIT）
  vendor/purify.min.js       危険な HTML を取り除くライブラリ DOMPurify（Apache-2.0 / MPL-2.0）
  js/firebase-config.js      あなたの Firebase の設定値
  js/config.js               テーマ一覧などの設定
  vendor/Sortable.min.js     並べ替えライブラリ SortableJS（MIT）
firestore.rules              Firestore のセキュリティルール（コンソールに貼り付ける見本）
firebase.json                エミュレーター用の設定
.github/workflows/pages.yml  public/ を GitHub Pages に公開する設定
```

### データの保存形式

Firestore の `dashboards/{ユーザー ID}` ドキュメントに、次の形で保存します。

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
| 「〇〇 ではこのダッシュボードを使えません」 | 手順 4 のルールの `allowedEmails()` にそのアドレスが**小文字で**入っているか、ルールを**公開**したか |
| 「Firestore のデータベースが見つかりません」 | 手順 4 で Firestore Database を作成したか |
| カレンダー・Gmail のウィジェットに「Google Cloud で『Google Calendar API』（または『Gmail API』）が有効になっていません」 | 表示されたリンクを開き、Firebase と同じプロジェクトで **有効にする** を押す（手順 9）。反映に数分かかるので、待ってから ↻ |
| カレンダー・Gmail のウィジェットに「必要な権限が許可されていません」 | 手順 9 の 3 で権限（スコープ）を追加したか。追加後は「連携し直す」で、確認画面のチェックをすべて入れて許可する |
| 「ポップアップがブロックされました」 | ブラウザでこのサイトのポップアップを許可して、もう一度ログイン |
| 変更が反映されない | Actions タブで最新の「Deploy to GitHub Pages」が成功しているか確認し、キャッシュを無視して再読み込み（Mac は ⌘⇧R、Windows は Ctrl+Shift+R）。GitHub Pages のファイルはブラウザに最大 10 分ほどキャッシュされます |
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
