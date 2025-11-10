import React, { useState, useMemo } from 'react';
import { Character } from '../../../../types';
import { useEditorContext } from '../../contexts/EditorContext';
import CharacterListHeaderControls from './CharacterListHeaderControls'; 
import CharacterListItemView from './CharacterListItemView'; 
import { useStore } from '../../../../store/useStore'; 
import MergeCharactersModal from '../editor_page_modal/MergeCharactersModal';

interface ControlsAndCharactersPanelProps {
  onDeleteCharacter: (characterId: string) => void; 
}

export const ControlsAndCharactersPanel: React.FC<ControlsAndCharactersPanelProps> = ({
  onDeleteCharacter,
}) => {
  const {
    currentProject,
    characters,
    cvStyles,   
    selectedChapterId,
    openCharacterSidePanel,
    openCvModal,
    openCharacterEditModal, 
    characterFilterMode, 
    setCharacterFilterMode, 
  } = useEditorContext();

  const storeCharacters = useStore(state => state.characters);
  const mergeHistory = useStore(state => state.mergeHistory);
  const mergeCharactersAction = useStore(state => state.mergeCharacters);
  const undoLastMergeAction = useStore(state => state.undoLastMerge);
  const deleteCharactersAction = useStore(state => state.deleteCharacters);
  const openConfirmModal = useStore(state => state.openConfirmModal);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCharacterIdsForMerge, setSelectedCharacterIdsForMerge] = useState<string[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const charactersToDisplay = useMemo(() => {
    let relevantChars = storeCharacters.filter(c => (!c.projectId || c.projectId === currentProject?.id) && c.status !== 'merged');
    const uniqueCharsMap = new Map<string, Character>();
    relevantChars.forEach(char => {
        const lowerCaseName = char.name.toLowerCase();
        const existingChar = uniqueCharsMap.get(lowerCaseName);
        if (!existingChar || (char.projectId && !existingChar.projectId)) {
            uniqueCharsMap.set(lowerCaseName, char);
        }
    });
    let uniqueChars = Array.from(uniqueCharsMap.values());
    
    if (characterFilterMode === 'currentChapter' && currentProject && selectedChapterId) {
      const chapter = currentProject.chapters.find(ch => ch.id === selectedChapterId);
      const characterIdsInChapter = new Set(chapter?.scriptLines.map(line => line.characterId).filter(Boolean) as string[]);
      uniqueChars = uniqueChars.filter(char => characterIdsInChapter.has(char.id));
    }

    if (searchTerm.trim() !== '') {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        uniqueChars = uniqueChars.filter(char => 
            char.name.toLowerCase().includes(lowercasedSearchTerm) ||
            (char.cvName && char.cvName.toLowerCase().includes(lowercasedSearchTerm))
        );
    }
    return uniqueChars;
  }, [storeCharacters, characterFilterMode, currentProject, selectedChapterId, searchTerm]);

  const handleAddNewCharacterClick = () => {
    openCharacterEditModal(null); 
  };
  
  const handleToggleSelectForMerge = (characterId: string) => {
    setSelectedCharacterIdsForMerge(prev =>
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleOpenMergeModal = () => {
    if (selectedCharacterIdsForMerge.length < 2) {
      alert("请至少选择两个角色进行合并。");
      return;
    }
    setIsMergeModalOpen(true);
  };

  const handleConfirmMerge = (targetCharacterId: string) => {
    const sourceIds = selectedCharacterIdsForMerge.filter(id => id !== targetCharacterId);
    if (sourceIds.length === 0 || !targetCharacterId) {
        alert("合并错误：必须有源角色和目标角色。");
        return;
    }
    mergeCharactersAction(sourceIds, targetCharacterId);
    setIsMergeModalOpen(false);
    setSelectedCharacterIdsForMerge([]);
  };

  const handleUndoLastMerge = () => {
    if (mergeHistory.length > 0) {
        undoLastMergeAction();
    } else {
        alert("没有可以撤销的合并操作。");
    }
  };

  const handleBatchDeleteCharacters = () => {
    if (selectedCharacterIdsForMerge.length === 0) {
        alert("请先勾选要删除的角色。");
        return;
    }
    openConfirmModal(
        `批量删除角色确认`,
        `您确定要删除选中的 ${selectedCharacterIdsForMerge.length} 个角色吗？\n所有项目中引用这些角色的台词行，其角色将被重置为“未分配”。此操作无法撤销。`,
        () => {
            deleteCharactersAction(selectedCharacterIdsForMerge);
            setSelectedCharacterIdsForMerge([]);
        },
        "确认删除",
        "取消"
    );
  };

  return (
    <div className="p-4 h-full flex flex-col bg-slate-800 text-slate-100">
      <CharacterListHeaderControls
        filterMode={characterFilterMode} 
        onSetFilterMode={setCharacterFilterMode} 
        onAddNewCharacter={handleAddNewCharacterClick} 
        selectedCharacterIdsForMerge={selectedCharacterIdsForMerge}
        onMergeSelectedCharacters={handleOpenMergeModal}
        canUndoMerge={mergeHistory.length > 0}
        onUndoLastMerge={handleUndoLastMerge}
        onBatchDeleteCharacters={handleBatchDeleteCharacters}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <div className="flex-grow overflow-y-auto space-y-1.5 pr-1">
        {charactersToDisplay.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-3">
            {searchTerm.trim() ? `未找到匹配的角色 "${searchTerm}"。` : (characterFilterMode === 'currentChapter' ? '本章尚未分配角色。' : '项目中还没有角色。')}
          </p>
        ) : (
          charactersToDisplay.map(char => (
            <CharacterListItemView
              key={char.id}
              character={char}
              cvStyles={cvStyles} 
              onOpenCvModal={openCvModal} 
              onOpenCharacterSidePanel={openCharacterSidePanel} 
              onEditCharacter={openCharacterEditModal} 
              onDeleteCharacter={onDeleteCharacter} 
              isSelectedForMerge={selectedCharacterIdsForMerge.includes(char.id)}
              onToggleSelectForMerge={handleToggleSelectForMerge}
            />
          ))
        )}
      </div>
      {isMergeModalOpen && selectedCharacterIdsForMerge.length > 0 && (
        <MergeCharactersModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          charactersToMerge={storeCharacters.filter(c => selectedCharacterIdsForMerge.includes(c.id))}
          onConfirmMerge={handleConfirmMerge}
        />
      )}
    </div>
  );
};
