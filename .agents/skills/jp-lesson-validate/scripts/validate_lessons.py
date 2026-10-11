#!/usr/bin/env python3
"""Read-only structural validation of lesson data. No database dependencies."""
import argparse,json,re,sys,datetime
from pathlib import Path

ORIGINS={'teacher_correction','lesson_material','assistant_supplement'}
VERIFIED={'source_supported','user_confirmed','needs_review'}
def require(ok,message):
    if not ok:raise ValueError(message)
def strings(x,name):
    require(isinstance(x,list) and all(isinstance(a,str) for a in x),name+' must be string array')
def identity(value,prefix):
    require(isinstance(value,str) and re.fullmatch(prefix+r'_[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}',value),f'Invalid {prefix} ID: {value}')
def examples(items):
    require(isinstance(items,list) and bool(items),'examples must be nonempty array')
    for ex in items:
        require(isinstance(ex,dict),'example must be object')
        require(all(isinstance(ex.get(k),str) and ex[k].strip() for k in ['japanese','meaning_zh']),'example text missing')
        require(ex.get('origin') in {'source','assistant_supplement'},'invalid example origin')
def item(x,prefix):
    require(isinstance(x,dict),'item must be object')
    identity(x.get('id'),prefix)
    require(all(isinstance(x.get(k),str) and x[k].strip() for k in ['japanese','meaning_zh']),'item text missing')
    strings(x.get('tags'),'tags');examples(x.get('examples'))
    require(x.get('origin') in ORIGINS,'invalid item origin')
    require(x.get('verification') in VERIFIED,'invalid verification')
def validate(d):
    require(isinstance(d,dict) and type(d.get('schema_version')) is int and d['schema_version']==1,'schema_version must be 1')
    lesson=d.get('lesson');require(isinstance(lesson,dict),'lesson metadata missing')
    identity(lesson.get('id'),'lesson')
    require(isinstance(lesson.get('title'),str) and lesson['title'].strip(),'lesson title missing')
    for k in ['lesson_date','created_date']:
        value=lesson.get(k)
        if k=='lesson_date' and value is None:continue
        require(isinstance(value,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',value),k+' invalid')
        datetime.date.fromisoformat(value)
    strings(lesson.get('source_files'),'source_files');strings(lesson.get('tags'),'lesson tags')
    require(isinstance(d.get('expressions'),list) and isinstance(d.get('vocabulary'),list),'content arrays missing')
    ids={lesson['id']};vocab=set()
    for w in d['vocabulary']:
        item(w,'vocab');require(w['id'] not in ids,'duplicate ID');ids.add(w['id']);vocab.add(w['id'])
        require(all(isinstance(w.get(k),str) and w[k].strip() for k in ['reading','part_of_speech']),'reading or part_of_speech missing')
        strings(w.get('collocations'),'collocations')
    for e in d['expressions']:
        item(e,'expr');require(e['id'] not in ids,'duplicate ID');ids.add(e['id'])
        require(isinstance(e.get('explanation_zh'),str),'explanation missing')
        require('original_japanese' in e,'original_japanese missing')
        for k in ['original_japanese','error_example_japanese','corrected_japanese']:
            require(e.get(k) is None or isinstance(e[k],str),k+' must be string or null')
        strings(e.get('contexts'),'contexts');strings(e.get('vocabulary_ids'),'vocabulary_ids')
        require(set(e['vocabulary_ids'])<=vocab,'unknown vocabulary reference')
    require(isinstance(d.get('unresolved'),list),'unresolved must be array')
    for u in d['unresolved']:
        require(isinstance(u,dict) and isinstance(u.get('description_zh'),str),'invalid unresolved entry')
        strings(u.get('related_item_ids'),'related_item_ids')
        require(set(u['related_item_ids'])<=ids,'unknown unresolved reference')
        require(u.get('source_excerpt') is None or isinstance(u['source_excerpt'],str),'invalid source_excerpt')
    return lesson['id']
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path',nargs='?',default='lessons');args=parser.parse_args()
    path=Path(args.path)
    files=[path] if path.is_file() else sorted(path.glob('*/lesson.json'))
    if not files:print('No lesson.json found',file=sys.stderr);return 1
    seen_lessons=set();seen_words={};failed=0;counts=[0,0]
    for file in files:
        try:
            d=json.loads(file.read_text(encoding='utf-8'));lid=validate(d)
            require(lid not in seen_lessons,'duplicate lesson ID across files')
            pending={}
            for w in d['vocabulary']:
                identity_tuple=(w['japanese'],w['reading'],w['meaning_zh'])
                require(w['id'] not in seen_words or seen_words[w['id']]==identity_tuple,'conflicting vocabulary identity across lessons')
                pending[w['id']]=identity_tuple
            seen_lessons.add(lid);seen_words.update(pending)
            counts[0]+=len(d['expressions']);counts[1]+=len(d['vocabulary'])
            print(f'OK {file}: {len(d["expressions"])} expressions, {len(d["vocabulary"])} vocabulary entries')
        except (ValueError,TypeError,KeyError,OSError) as error:
            failed+=1;print(f'FAIL {file}: {error}',file=sys.stderr)
    print(f'{len(files)} files; {failed} failures; {counts[0]} expressions; {len(seen_words)} unique vocabulary IDs')
    return 1 if failed else 0
if __name__=='__main__':sys.exit(main())
