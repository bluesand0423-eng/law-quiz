import { useState } from "react";
import IssueList from "./IssueList";
import IssueDetail from "./IssueDetail";
import IssueForm from "./IssueForm";

// 冰原功能的進入點元件。沿用 App.jsx 既有「以字串狀態切換畫面、不用 router」的
// 模式，只是把狀態機收在這個子元件內，不污染 App.jsx 既有的 mode 狀態機。
export default function IcefieldApp({ T, notifySyncFailure, onExit }) {
  const [view, setView] = useState("list"); // list | detail | edit
  const [activeSlug, setActiveSlug] = useState(null);
  const [editingSlug, setEditingSlug] = useState(null); // null = 新增

  function openDetail(slug) {
    setActiveSlug(slug);
    setView("detail");
  }
  function openCreate() {
    setEditingSlug(null);
    setView("edit");
  }
  function openEdit(slug) {
    setEditingSlug(slug);
    setView("edit");
  }
  function backToList() {
    setView("list");
  }

  if (view === "detail" && activeSlug) {
    return (
      <IssueDetail
        T={T}
        slug={activeSlug}
        onBack={backToList}
        onEdit={openEdit}
      />
    );
  }

  if (view === "edit") {
    return (
      <IssueForm
        T={T}
        slug={editingSlug}
        notifySyncFailure={notifySyncFailure}
        onSaved={openDetail}
        onCancel={() => (editingSlug ? openDetail(editingSlug) : backToList())}
      />
    );
  }

  return (
    <IssueList
      T={T}
      onOpen={openDetail}
      onCreate={openCreate}
      onBack={onExit}
    />
  );
}
