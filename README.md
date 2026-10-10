# ajimarunakajima

あじまるやの注文・厨房・会計ページです。

- `index.html` — メインページ。各画面へのリンクとテーブル別注文リンクを表示します。
- `customer.html` — お客様の注文画面。
- `customer/index.html` — `/customer/` URLから注文画面へ移動します。
- `kitchen.html` — 厨房ディスプレイ。
- `admin.html` — お会計と営業集計。
- `firebase-sync.js` — お客様・厨房・会計画面で共有するFirebase Realtime Database連携。

テーブル別の注文ページは `customer.html#t=3` のようにリンクできます。メインページの `#t=3` 形式のリンクも注文画面へ転送されます。

注文はFirebase Realtime Databaseに保存され、別の端末の厨房・会計画面にもリアルタイムで表示されます。厨房と会計画面はスタッフ用Googleアカウントでログインしてください。Firebase Authenticationで匿名認証とGoogle認証を有効にし、公開サイトのドメインを許可済みドメインに追加したうえで、Realtime Databaseにスタッフとお客様向けのアクセスルールを設定する必要があります。
