TopologyTreeBuilder = function(userOptions) {
	var options = $.extend({
		refreshInterval : 30 * 1000,
		errorHandler : undefined,
		okHandler : undefined
	}, userOptions);

	if (typeof options.refreshInterval != "number" || options.refreshInterval < 0) {
		throw new TypeError("refreshInterval must be a positive number or zero to disable");
	}
	if (typeof options.errorHandler != "undefined" && typeof options.errorHandler != "function") {
		throw new TypeError("errorHandler must be a function");
	}

	var treeMargins = [ 96, 5, 126, 5 ];
	var visDimensions = new UPTIME.pub.gadgets.Dimensions(100, 100);
	var treeDimensions = toTreeDimensions(visDimensions);

	var transitionDuration = 500;

	var expandedRadius = 4;
	var minContractedRadius = 6;
	var maxContractedRadius = 20;
	var massiveNodeRadius = 30;

	function translateYX(d) {
		return "translate(" + d.y + "," + d.x + ")";
	}

	function projectYX(d) {
		return [ d.y, d.x ];
	}

	function oldXY(d) {
		return {
			x : d.oldX,
			y : d.oldY
		};
	}

	var root = null;
	var refreshableNodes = {};
	var refreshTimeoutId = null;

	var currNodeId = 0;
	var tree = d3.layout.tree().size([ treeDimensions.height, treeDimensions.width ]).children(getChildren).sort(function(a, b) {
		return naturalSort(a.elementName, b.elementName);
	});

	var vis = d3.select("#treeContainer").append("svg:svg").attr("id", "treeCanvas").attr("width", visDimensions.width).attr(
			"height", visDimensions.height).attr("viewBox", "0 0 " + visDimensions.width + " " + visDimensions.height).append(
			"svg:g").attr("transform", "translate(" + treeMargins[0] + "," + treeMargins[1] + ")");

	var showLabels = true;

	this.setShowLabels = function(newShowLabels) {
		if (typeof newShowLabels == "boolean" && showLabels != newShowLabels) {
			showLabels = newShowLabels;
			vis.selectAll("g.node text").style("fill-opacity", getTextOpacity);
		}
	};

	this.resize = function(dimensions) {

		visDimensions = toVisDimensions(dimensions);
		treeDimensions = toTreeDimensions(visDimensions);

		d3.select("#treeCanvas").attr("width", visDimensions.width).attr("height", visDimensions.height).attr("viewBox",
				"0 0 " + visDimensions.width + " " + visDimensions.height);

		tree.size([ treeDimensions.height, treeDimensions.width ]);

		if (root != null) {
			updateTree(root);
		}

	};

	this.buildTree = function(source) {
		if (root == null) {
			source.oldX = treeDimensions.height / 2;
			source.oldY = 10;
		} else {
			source.oldX = root.x;
			source.oldY = root.y;
		}
		if (refreshTimeoutId != null) {
			clearTimeout(refreshTimeoutId);
			refreshTimeoutId = null;
		}
		refreshableNodes = {};
		root = source;
		updateTree(root);
		scheduleNextRefresh();
	};

	function scheduleNextRefresh() {
		if (options.refreshInterval > 0) {
			refreshTimeoutId = setTimeout(refreshTree, options.refreshInterval);
		}
	}

	function refreshTree() {
		refreshTimeoutId = null;
		var promises = [];
		$.each(refreshableNodes, function(i, node) {
			// we're redundantly getting element statuses where a single element
			// appears as multiple different nodes in the tree, but oh well
			promises.push(refreshElementStatus(node));
		});
		UPTIME.pub.gadgets.promises.all(promises).then(options.okHandler, options.errorHandler).then(scheduleNextRefresh);
	}

	function refreshElementStatus(node) {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements/" + node.elementId + "/status", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			deferred.resolve(updateNodeStatus(node, data));
		}).fail(function(jqXHR, textStatus, errorThrown) {
			if (jqXHR.status == 404) {
				deferred.resolve(updateNodeStatus(node));
			} else {
				deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
			}
		});
		return deferred.promise;
	}

	function updateNodeStatus(node, elementStatus) {
		if (!elementStatus) {
			return removeNode(node);
		} else if (node.parent && node.parent.elementId) {
			// if we were removed from the topology...
			if ($.grep(elementStatus.topologyParentStatus, function(topologyParentStatus) {
				return topologyParentStatus.id == node.parent.elementId;
			}).length == 0) {
				return removeNode(node);
			}
		}
		node.elementStatus = elementStatus.status;
		node.statusMessage = elementStatus.message;
		node.monitorStatus = $.map(elementStatus.monitorStatus, function(monitorStatus) {
			return monitorStatus.isHidden ? undefined : {
				id : monitorStatus.id,
				name : monitorStatus.name,
				status : monitorStatus.status
			};
		}).sort(function(a, b) {
			return naturalSort(a.name, b.name);
		});
		d3.select("#topologyTreeNode_" + node.id).attr("class", getNodeClass(node));
		return node;
	}

	this.reset = function() {
		resetExpansions(root, null);
	};

	this.expandAll = function() {
		resetExpansions(root, "full");
	};

	function resetExpansions(node, value) {
		if (!node.hasChildren) {
			return;
		}
		if (node.expansion != value) {
			removeD3Children(node);
			node.expansion = value;
			storeExpansion(node);
			updateTree(node);
		}
		$.each(node.branches, function(i, child) {
			resetExpansions(child, value);
		});
	}

	function storeExpansion(node) {
		if (!window.localStorage || !node.hasChildren) {
			return;
		}
		if (!node.expansion) {
			window.localStorage.removeItem(expansionStorageKey(node));
			return;
		}
		window.localStorage.setItem(expansionStorageKey(node), node.expansion);
	}

	function loadStoredExpansion(node) {
		if (!window.localStorage || !node.hasChildren || node.expansion) {
			return;
		}
		node.expansion = window.localStorage.getItem(expansionStorageKey(node));
	}

	function expansionStorageKey(node) {
		return "uptime.TopologyTree." + uptimeGadget.getInstanceId() + "." + node.elementId;
	}

	function updateTree(actionNode) {
		var treeNodes = tree.nodes(root).reverse();

		// select the visible nodes/links and make sure they have unique ids
		var visibleNodes = vis.selectAll("g.node").data(treeNodes, function(node) {
			if (!node.id) {
				node.id = ++currNodeId;
				if (node.elementId) {
					refreshableNodes[node.id] = node;
				}
			}
			return node.id;
		});
		var visibleLinks = vis.selectAll("path.link").data(tree.links(treeNodes), function(link) {
			return link.source.id + '.' + link.target.id;
		});

		createNewNodes(visibleNodes, visibleLinks, actionNode);
		updateExistingNodes(visibleNodes, visibleLinks);
		removeExitingNodes(visibleNodes, visibleLinks, actionNode);
		treeNodes.forEach(function(node) {
			node.oldX = node.x;
			node.oldY = node.y;
		});
	}

	function toVisDimensions(dimensions) {
		return new UPTIME.pub.gadgets.Dimensions(Math.max(100, dimensions.width), Math.max(100, dimensions.height));
	}

	function toTreeDimensions(dimensions) {
		var w = dimensions.width - treeMargins[0] - treeMargins[2];
		var h = dimensions.height - treeMargins[1] - treeMargins[3];
		return new UPTIME.pub.gadgets.Dimensions(w, h);
	}

	function getChildren(node) {
		if (node.elementId && !refreshableNodes[node.id]) {
			refreshElementStatus(node);
		}
		loadStoredExpansion(node);
		if (!node.hasChildren || node.expansion == "none") {
			return [];
		}
		var children = $.merge([], node.branches);
		if (node.expansion == "full") {
			return $.merge(children, node.leaves);
		}
		return children;
	}

	function getFillColor(node) {
		if (!node.elementId) {
			return "black";
		}
		switch (node.elementStatus) {
		case "CRIT":
			return "#B61211";
		case "WARN":
			return "#DAD60B";
		case "OK":
			return "#67B10B";
		case "MAINT":
			return "#555B98";
		case "UNKNOWN":
		default:
			return "#E6E6E6";
		}
	}

	function getRadius(node) {
		var r = expandedRadius;
		if (node.hasChildren && node.expansion != "full") {
			if (node.expansion == "none") {
				r = minContractedRadius + (node.branches.length + node.leaves.length) * 0.1;
			} else if (node.leaves.length > 0) {
				r = minContractedRadius + node.leaves.length * 0.1;
			}
			if (r > maxContractedRadius) {
				r = massiveNodeRadius;
			}
		}
		return r;
	}

	function toggleExpansion(node) {
		if (!node.elementId || !node.hasChildren) {
			return;
		}
		removeD3Children(node);
		if (node.expansion == "full") {
			node.expansion = "none";
		} else if (node.expansion == "none") {
			node.expansion = (node.branches.length > 0 && node.leaves.length > 0) ? "partial" : "full";
		} else {
			node.expansion = "full";
		}
		storeExpansion(node);
		updateTree(node);
	}

	function removeNode(node) {
		delete refreshableNodes[node.id];
		delete node.elementStatus;
		delete node.statusMessage;
		delete node.monitorStatus;
		removeD3Children(node);
		d3.select("#topologyTreeNode_" + node.id).attr("class", getNodeClass(node));
		if (!node.parent) {
			// if node.parent hasn't been set, that means D3 hasn't rendered the
			// node into its tree, just return and hope that it'll fix itself on
			// the next expansion of this node's parent
			return;
		}
		if (node.hasChildren) {
			node.parent.branches = $.grep(node.parent.branches, function(branch) {
				return branch != node;
			});
			if (node.parent.expansion != "none") {
				removeD3Children(node.parent);
				updateTree(node.parent);
			}
		} else {
			node.parent.leaves = $.grep(node.parent.leaves, function(leaf) {
				return leaf != node;
			});
			if (node.parent.expansion == "full") {
				removeD3Children(node.parent);
				updateTree(node.parent);
			}
		}
	}

	function removeD3Children(node) {
		// removes D3's "children" array so we can call updateTree() to rebuild
		// it based on the expansion setting
		if (node.hasChildren && node.children) {
			$.each(node.children, function(i, child) {
				removeD3Children(child);
				delete refreshableNodes[child.id];
			});
			delete node.children;
		}
	}

	function redirectToElementProfilePage(node) {
		if (!node.elementId) {
			return;
		}
		var url = uptimeGadget.getElementUrls(node.elementId, node.elementName);
		window.top.location.href = url.services;
	}

	function showStatusDetail(node) {
		if (!node.elementId) {
			return;
		}
		var div = d3.select("#tooltip");
		div.transition().duration(transitionDuration).style("opacity", 1).style("border-color", getFillColor(node));
		div.html(constructMessage(node)).style("left", (d3.event.pageX + 10) + "px").style("top", (d3.event.pageY - 28) + "px");

		highlightPath(node);
	}

	function constructMessage(node) {
		var message = '<ul class="tooltipDetail">';
		message += '<li><span class="tooltipDetailTitle">Element Name:</span><span>' + node.elementName + '</span></li>';
		if (node.elementStatus) {
			message += '<li><span class="tooltipDetailTitle">Element Status:</span><span>' + node.elementStatus + '</span></li>';
		}
		if (node.statusMessage) {
			message += '<li><span class="tooltipDetailTitle">Status Message:</span><span>' + node.statusMessage + '</span></li>';
		}
		message += '<li><span class="tooltipDetailTitle">Element Type:</span><span>' + node.elementType + '</span></li>';
		if (node.monitorStatus && node.monitorStatus.length > 0) {
			message += '<li class="separator"></li>';
			$.each(node.monitorStatus, function(i, monitorStatus) {
				message += '<li><span class="tooltipDetailTitle">' + monitorStatus.name + ':</span><span>' + monitorStatus.status
						+ '</span></li>';
			});
		}
		message += '</ul>';
		return message;
	}

	function hideStatusDetail(node) {
		var div = d3.select("#tooltip");
		div.transition().duration(transitionDuration).style("opacity", 1e-6);

		unhighlightPath(node);
	}

	function highlightPath(node) {
		var eligibleTargets = getEligibleTargetIds(node);
		vis.selectAll(".link").style("stroke", function(p) {

			var linkId = p.target.id;
			if (eligibleTargets.indexOf(linkId) != -1) {
				return getFillColor(node);
			}
		});
	}

	function unhighlightPath(node) {
		vis.selectAll(".link").style("stroke", null);
	}

	function getEligibleTargetIds(node) {
		var eligibleIds = [];
		eligibleIds.push(node.id);
		if (node.parent) {
			eligibleIds = eligibleIds.concat(getEligibleTargetIds(node.parent));
		}
		return eligibleIds;
	}

	function getTextOpacity(node) {
		if (node.hasChildren || showLabels) {
			return 1;
		}
		return 1e-6;
	}

	function removeExitingNodes(visibleNodes, visibleLinks, actionNode) {
		var removedNodes = visibleNodes.exit().transition().duration(transitionDuration).attr("transform", function(node) {
			return translateYX(actionNode);
		}).remove();
		removedNodes.select("circle").attr("r", 1e-6);
		removedNodes.select("text").style("fill-opacity", 1e-6);
		visibleLinks.exit().transition().duration(transitionDuration).attr("d",
				d3.svg.diagonal().source(actionNode).target(actionNode).projection(projectYX)).remove();
	}

	function updateExistingNodes(visibleNodes, visibleLinks) {
		var updatedNodes = visibleNodes.transition().duration(transitionDuration).attr("transform", translateYX);
		updatedNodes.select("circle").attr("r", getRadius);
		updatedNodes.select("text").attr("text-anchor", function(node) {
			return hasVisibleChildren(node) ? "end" : "start";
		}).attr("x", function(node) {
			return hasVisibleChildren(node) ? -12 : 12;
		}).style("fill-opacity", getTextOpacity);
		visibleLinks.transition().duration(transitionDuration).attr("d", d3.svg.diagonal().projection(projectYX));
	}

	function hasVisibleChildren(node) {
		return node.hasChildren && (node.expansion == "full" || (node.expansion != "none" && node.branches.length > 0));
	}

	function createNewNodes(visibleNodes, visibleLinks, actionNode) {
		var newNodes = visibleNodes.enter().append("svg:g").attr("id", function(node) {
			return "topologyTreeNode_" + node.id;
		}).attr("class", getNodeClass).attr("transform", function(node) {
			return translateYX(oldXY(actionNode));
		}).on("mouseover", showStatusDetail).on("mouseout", hideStatusDetail);
		newNodes.append("svg:circle").attr("r", 1e-6).on("click", toggleExpansion);
		newNodes.append("svg:text").attr("dy", ".35em").text(function(node) {
			return node.elementName;
		}).style("fill-opacity", 1e-6).on("click", redirectToElementProfilePage);
		visibleLinks.enter().insert("svg:path", "g").attr("class", "link").attr("d",
				d3.svg.diagonal().source(oldXY(actionNode)).target(oldXY(actionNode)).projection(projectYX));
	}

	function getNodeClass(node) {
		if (!node.elementId) {
			return "node node-root";
		}
		if (node.elementStatus) {
			return "node node-" + node.elementStatus;
		}
		return "node";
	}

};