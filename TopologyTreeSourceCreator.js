TopologyTreeSourceCreator = function(){
	var uptime_api = new uptimeApi();
	var availableElementsForTree = {};
	var treeRenderingFunction;

	this.getSource = function(successCallback,errorCallback){

		treeRenderingFunction = successCallback;
		uptime_api.getElements("", pushIntoElementArray,errorCallback);
	}

	var pushIntoElementArray = function(elements){
		numElements = elements.length-1;
		var allStatusTasks = [];

		$.each(elements, function(index,element) {	
			if (element.isMonitored)
			{
				var statusTask = new $.Deferred();
				allStatusTasks.push(statusTask);
				var elementNode = new Object();
				elementNode.id = element.id;
				elementNode.name = element.name;
				elementNode.typeSubtypeName = element.typeSubtypeName;
				setupStatus(element.id, function(statusInfo){
					elementNode.status = statusInfo.status;
					elementNode.parents = statusInfo.parentsStatus;
					elementNode.monitorStatus = statusInfo.monitorStatuses;
					elementNode.message = statusInfo.message;
					statusTask.resolve();
				});
				availableElementsForTree[elementNode.id] = elementNode;
			}
		});
		$.when.apply($, allStatusTasks).done(buildTreeInMemory);
	}

	var setupStatus = function(id, handleElementStatus){
		uptime_api.getElementStatus(id, function(elementStatus) {
			var statusInfo = {};
			statusInfo.message = elementStatus.message;
			statusInfo.status = elementStatus.status;
			statusInfo.parentsStatus = getAdditionalStatus(elementStatus.topologyParentStatus);
			statusInfo.monitorStatuses = getAdditionalStatus(elementStatus.monitorStatus);
			handleElementStatus(statusInfo);
		});
	}

	var getAdditionalStatus = function(additionalStatus){
		// At least one Topological Parent, push parents into the element's 'parents' array
		var additionalStatusArray = new Array();
		if(additionalStatus.length != 0) {
			$.each(additionalStatus, function(j, additionalElementStatus) {
				additionalStatusArray.push( {
					id: additionalElementStatus.id,
					name: additionalElementStatus.name,
					status: additionalElementStatus.status,
					
				});
			});
		}
		return additionalStatusArray;
	}
	
	var createRoot = function(){
		var root = new Object();
		root.entityId = 0;
		root.entityName = "My Infrastructure";
		root.dependents = new Array();
		root.entityStatus = "OK";
		root.type = "Invisible";
		root.statusMessage = "This is always the root of any topology tree";
		root.monitorStatus = new Array();
		return root;
	}

	var buildTreeInMemory = function() {
		var elementsOnTree = {};
		var root = createRoot();
		$.each(availableElementsForTree, function(i, currentNode){
			if (hasNoParents(currentNode))
			{
				var childNode = getNodeOnTree(elementsOnTree, currentNode);
				elementsOnTree[childNode.entityId] = childNode;
				root.dependents.push(childNode);
			}
			if (currentNode.status != "OK")
			{
				createBranch(availableElementsForTree, elementsOnTree, currentNode, root);
			}
		});
		treeRenderingFunction(decompressTree(root));
	}

	var decompressTree =  function(source){
		return jQuery.extend(true, {}, source);
	}


	var createBranch = function (availableElementsForTree, elementsOnTree, node, root){
		var childNode = getNodeOnTree(elementsOnTree, node);
		elementsOnTree[childNode.entityId] = childNode;


			$.each(node.parents, function(i, parent){
				var parentOnTree = elementsOnTree[parent.id];
				if (typeof parentOnTree=="undefined")
				{
					var parentNode = availableElementsForTree[parent.id];
					if (isParentNodeAvailableForTree(parentNode))
					{
						parentOnTree = createBranch(availableElementsForTree, elementsOnTree, parentNode, root);
					}else{
						parentOnTree = buildInvisibleParentNode(parent, elementsOnTree, root);

					}

				}

				if (isParentExist(parentOnTree) && !isAlreadyDependent(parentOnTree, childNode))
				{
					parentOnTree.dependents.push(childNode);
				}
			});
		
		
		return childNode;
	}

	var buildInvisibleParentNode = function(node, elementsOnTree, root){
		if(typeof elementsOnTree[node.id]!="undefined"){
			var parentOnTree = elementsOnTree[node.id];
			elementsOnTree[parentOnTree.entityId] = parentOnTree;
			root.dependents.push(parentOnTree);		
			return parentOnTree;	
		}
		var newNode = new Object();
		newNode.entityId = node.id;
		newNode.entityName = node.name;
		newNode.entityStatus = node.status;
		newNode.statusMessage = "You don't have permission to view this element";
		newNode.monitorStatus = new Array();
		newNode.type = "Invisible";
		newNode.dependents = new Array();
		elementsOnTree[newNode.entityId] = newNode;
		root.dependents.push(newNode);		
		return newNode;
	}

	var isParentNodeAvailableForTree = function(parentNode){
		return parentNode != null;
	}

	var isParentExist = function(parent){
		return typeof parent!="undefined";
	}

	var isAlreadyDependent = function(parent, child){
		var matchedElements = $.grep(parent.dependents, function(e){ return e.entityId == child.entityId; });
		return matchedElements!=0;
	}

	var getNodeOnTree = function(elementsOnTree, currentNode){

		if(typeof elementsOnTree[currentNode.id]!="undefined"){
			return elementsOnTree[currentNode.id];	
		}
		return createNodeOnTree(currentNode);
	}

	var createNodeOnTree = function(currentNode){
		var newNode = new Object();
		newNode.entityId = currentNode.id;
		newNode.entityName = currentNode.name;
		newNode.entityStatus = currentNode.status;
		newNode.statusMessage = currentNode.message;
		newNode.monitorStatus = currentNode.monitorStatus;
		newNode.type = currentNode.typeSubtypeName;
		newNode.dependents = new Array();
		return newNode;
	}

	var hasNoParents = function(node){
		return node.parents.length == 0;
	}
		
}