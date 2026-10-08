# AGA — AI Growth Animal

AGA는 기존 Windows AI-PET의 핵심 개체 상태를 모바일/태블릿에서 이어서 돌볼 수 있도록 만드는 **PWA Companion** 프로젝트입니다.

## 방향

- Windows AI-PET: PET의 집(Home). 바탕화면 이동, 로컬 파일 도구, Python 처리 엔진.
- AGA PWA: PET을 데리고 다니는 모바일 몸체. 터치, 대화, 가르치기, 성장 확인.
- 공통 상태 규격: `PET Portable State v1` JSON.
- 원칙: 같은 PET을 새로 복제하는 것이 아니라, 같은 개체의 상태를 옮기고 이어 키웁니다.
- 기본은 로컬 저장이며, 서버/호텔 동기화는 후속 단계에서 추가합니다.

## v0.1 목표

1. 설치 가능한 PWA
2. 오프라인 실행
3. 모바일 터치 돌봄
4. 간단한 대화/가르치기
5. IndexedDB 로컬 저장
6. PET Portable State JSON 가져오기/내보내기
7. 향후 Windows판과 연결할 공통 스키마 고정

## 개발 원칙

- 외부 CDN 없이 실행 가능
- 개인정보/기억은 기본적으로 기기 로컬 보관
- 사용자가 명시적으로 내보낼 때만 JSON 파일 생성
- 기능 권한은 향후 능력별로 분리
- 오프라인 시간을 방치/벌점으로 처리하지 않음

현재 단계: **AGA v0.1 PWA Companion 초기화**
